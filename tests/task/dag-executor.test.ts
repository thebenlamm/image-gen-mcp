import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CapabilityInvokeError, type Capability, type CapabilityInvokeResult } from '../../src/capabilities/types.js';
import { executeDag, type ExecPlan } from '../../src/task/dag-executor.js';
import { writeFileAtomic } from '../../src/runs/write.js';

vi.mock('../../src/runs/write.js', () => ({
  writeFileAtomic: vi.fn(async () => undefined),
}));

const writeFileAtomicMock = vi.mocked(writeFileAtomic);

function imageResult(model = 'mock-1'): CapabilityInvokeResult {
  return { kind: 'image', buffer: Buffer.from('fake-png'), model, revisedPrompt: 'revised' };
}

function dataResult(): CapabilityInvokeResult {
  return {
    kind: 'data',
    data: { type: 'dimensions', width: 1, height: 1, format: 'png', channels: 4, hasAlpha: true },
    model: 'mock-1',
  };
}

function makeMockCap(op: string, results: Array<CapabilityInvokeResult | Error> = [imageResult()]): Capability {
  const seq = [...results];
  const invoke = vi.fn(async () => {
    const next = seq.shift() ?? imageResult();
    if (next instanceof Error) throw next;
    return next;
  });
  return {
    op,
    provider: 'mock',
    modelVersion: 'mock-1',
    constraints: {},
    cost: { perCallUsd: 0 },
    invoke,
  } as unknown as Capability;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeDelayedCap(
  op: string,
  options: {
    delayMs: number;
    onStart?: () => void;
    onEnd?: () => void;
    result?: CapabilityInvokeResult;
    fail?: Error;
    constraints?: Capability['constraints'];
  },
): Capability {
  const invoke = vi.fn(async () => {
    options.onStart?.();
    await sleep(options.delayMs);
    options.onEnd?.();
    if (options.fail) throw options.fail;
    return options.result ?? imageResult();
  });
  return {
    op,
    provider: 'mock',
    modelVersion: 'mock-1',
    constraints: options.constraints ?? {},
    cost: { perCallUsd: 0 },
    invoke,
  } as unknown as Capability;
}

function makeRegistry(capsByKey: Record<string, Capability>) {
  return {
    get: (op: string, provider: string) => capsByKey[`${op}:${provider}`],
  };
}

function plan(nodes: ExecPlan['nodes'], terminalNodeId = nodes[nodes.length - 1]!.id): ExecPlan {
  return { goal: 'test', nodes, terminalNodeId };
}

describe('executeDag', () => {
  let runDir: string;
  const runId = 'run_20260503_120000_abcdef';

  beforeEach(() => {
    runDir = path.join(os.tmpdir(), `image-task-dag-${process.pid}-${Date.now()}`);
    fs.mkdirSync(runDir, { recursive: true });
    writeFileAtomicMock.mockClear();
  });

  afterEach(() => {
    fs.rmSync(runDir, { recursive: true, force: true });
  });

  it('executes a 3-node happy path in topological order', async () => {
    const caps = {
      'extract_subject:mock': makeMockCap('extract_subject'),
      'extract_subject:mock-b': makeMockCap('extract_subject'),
      'extract_subject:mock-c': makeMockCap('extract_subject'),
    };
    const result = await executeDag(
      plan([
        { id: 'A', op: 'extract_subject', provider: 'mock', params: {}, dependsOn: [], outputKind: 'image', costUsd: 0.01 },
        { id: 'B', op: 'extract_subject', provider: 'mock-b', params: { input: '$nodes.A.output' }, dependsOn: ['A'], outputKind: 'image', costUsd: 0.02 },
        { id: 'C', op: 'extract_subject', provider: 'mock-c', params: { input: '$nodes.B.output' }, dependsOn: ['B'], outputKind: 'image', costUsd: 0.03 },
      ], 'C'),
      {},
      { runId, runDir, registry: makeRegistry(caps) },
    );
    expect(Object.keys(result.nodeOutputs)).toEqual(['A', 'B', 'C']);
    expect(result.trace.nodes.map((node) => node.outcome)).toEqual(['success', 'success', 'success']);
    expect(result.totals).toMatchObject({ cost_usd: 0.06, success: 3, failure: 0, skipped: 0 });
    expect(result.bestPartial).toEqual({ nodeId: 'C', artifactPath: path.join(runDir, 'nC.png') });
  });

  it('keeps topological timing invariants with multiple ready branches', async () => {
    const caps = Object.fromEntries(
      ['A', 'B', 'C', 'D', 'E'].map((id) => [`extract_subject:mock-${id}`, makeMockCap('extract_subject')]),
    );
    const result = await executeDag(
      plan([
        { id: 'A', op: 'extract_subject', provider: 'mock-A', params: {}, dependsOn: [], outputKind: 'image' },
        { id: 'B', op: 'extract_subject', provider: 'mock-B', params: {}, dependsOn: [], outputKind: 'image' },
        { id: 'C', op: 'extract_subject', provider: 'mock-C', params: {}, dependsOn: ['A', 'B'], outputKind: 'image' },
        { id: 'D', op: 'extract_subject', provider: 'mock-D', params: {}, dependsOn: ['A', 'B'], outputKind: 'image' },
        { id: 'E', op: 'extract_subject', provider: 'mock-E', params: {}, dependsOn: ['C', 'D'], outputKind: 'image' },
      ], 'E'),
      {},
      { runId, runDir, registry: makeRegistry(caps) },
    );
    const traceById = new Map(result.trace.nodes.map((node) => [node.id.slice(1), node]));
    for (const node of result.trace.nodes) {
      expect(node.outcome).toBe('success');
    }
    for (const node of result.trace.nodes) {
      const planNode = result.trace.nodes.length && node.id.slice(1);
      const source = ['A', 'B', 'C', 'D', 'E'].find((id) => id === planNode)!;
      const deps = source === 'C' || source === 'D' ? ['A', 'B'] : source === 'E' ? ['C', 'D'] : [];
      for (const depId of deps) {
        expect(node.startedAtMs).toBeGreaterThanOrEqual(traceById.get(depId)!.endedAtMs);
      }
    }
  });

  it('retries a retryable CapabilityInvokeError once and records attempts', async () => {
    const cap = makeMockCap('extract_subject', [
      new CapabilityInvokeError('TIMEOUT', 'timeout', true),
      imageResult(),
    ]);
    const result = await executeDag(
      plan([{ id: 'A', op: 'extract_subject', provider: 'mock', params: {}, dependsOn: [], outputKind: 'image' }], 'A'),
      {},
      { runId, runDir, registry: makeRegistry({ 'extract_subject:mock': cap }) },
    );
    expect(cap.invoke).toHaveBeenCalledTimes(2);
    expect(result.trace.nodes[0]).toMatchObject({ attempts: 2, outcome: 'success' });
  });

  it('does not retry non-retryable CapabilityInvokeError values', async () => {
    const cap = makeMockCap('extract_subject', [
      new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'bad', false),
    ]);
    const result = await executeDag(
      plan([{ id: 'A', op: 'extract_subject', provider: 'mock', params: {}, dependsOn: [], outputKind: 'image' }], 'A'),
      {},
      { runId, runDir, registry: makeRegistry({ 'extract_subject:mock': cap }) },
    );
    expect(cap.invoke).toHaveBeenCalledTimes(1);
    expect(result.trace.nodes[0]).toMatchObject({
      outcome: 'error',
      attempts: 1,
      errorDetail: { code: 'CONSTRAINT_VIOLATION', retryable: false },
    });
  });

  it('does not retry more than once for repeated retryable errors', async () => {
    const cap = makeMockCap('extract_subject', [
      new CapabilityInvokeError('TIMEOUT', 'timeout 1', true),
      new CapabilityInvokeError('TIMEOUT', 'timeout 2', true),
    ]);
    const result = await executeDag(
      plan([{ id: 'A', op: 'extract_subject', provider: 'mock', params: {}, dependsOn: [], outputKind: 'image' }], 'A'),
      {},
      { runId, runDir, registry: makeRegistry({ 'extract_subject:mock': cap }) },
    );
    expect(cap.invoke).toHaveBeenCalledTimes(2);
    expect(result.trace.nodes[0]).toMatchObject({ outcome: 'error', attempts: 2 });
  });

  it('does not retry non-CapabilityInvokeError failures', async () => {
    const cap = makeMockCap('extract_subject', [new Error('something else')]);
    const result = await executeDag(
      plan([{ id: 'A', op: 'extract_subject', provider: 'mock', params: {}, dependsOn: [], outputKind: 'image' }], 'A'),
      {},
      { runId, runDir, registry: makeRegistry({ 'extract_subject:mock': cap }) },
    );
    expect(cap.invoke).toHaveBeenCalledTimes(1);
    expect(result.trace.nodes[0]).toMatchObject({ outcome: 'error', errorDetail: undefined });
  });

  it('skips transitive downstream nodes after a failure', async () => {
    const capA = makeMockCap('extract_subject');
    const capB = makeMockCap('extract_subject', [
      new CapabilityInvokeError('PROVIDER_FAILURE', 'forced', false),
    ]);
    const capC = makeMockCap('extract_subject');
    const capD = makeMockCap('extract_subject');
    const result = await executeDag(
      plan([
        { id: 'A', op: 'extract_subject', provider: 'mock-A', params: {}, dependsOn: [], outputKind: 'image' },
        { id: 'B', op: 'extract_subject', provider: 'mock-B', params: {}, dependsOn: ['A'], outputKind: 'image' },
        { id: 'C', op: 'extract_subject', provider: 'mock-C', params: {}, dependsOn: ['B'], outputKind: 'image' },
        { id: 'D', op: 'extract_subject', provider: 'mock-D', params: {}, dependsOn: ['C'], outputKind: 'image' },
      ], 'D'),
      {},
      { runId, runDir, registry: makeRegistry({
        'extract_subject:mock-A': capA,
        'extract_subject:mock-B': capB,
        'extract_subject:mock-C': capC,
        'extract_subject:mock-D': capD,
      }) },
    );
    expect(result.trace.nodes.map((node) => [node.id, node.outcome])).toEqual([
      ['nA', 'success'],
      ['nB', 'error'],
      ['nC', 'skipped'],
      ['nD', 'skipped'],
    ]);
    expect(result.trace.nodes[2]!.skipReason).toMatch(/B/);
    expect(result.trace.skips).toHaveLength(2);
    expect(capC.invoke).not.toHaveBeenCalled();
    expect(capD.invoke).not.toHaveBeenCalled();
  });

  it('returns deterministic best partial output after partial failure', async () => {
    const makeRun = () => executeDag(
      plan([
        { id: 'A', op: 'extract_subject', provider: 'mock-A', params: {}, dependsOn: [], outputKind: 'image' },
        { id: 'B', op: 'extract_subject', provider: 'mock-B', params: {}, dependsOn: ['A'], outputKind: 'image' },
        { id: 'C', op: 'extract_subject', provider: 'mock-C', params: {}, dependsOn: ['B'], outputKind: 'image' },
        { id: 'D', op: 'extract_subject', provider: 'mock-D', params: {}, dependsOn: ['C'], outputKind: 'image' },
      ], 'D'),
      {},
      { runId, runDir, registry: makeRegistry({
        'extract_subject:mock-A': makeMockCap('extract_subject'),
        'extract_subject:mock-B': makeMockCap('extract_subject'),
        'extract_subject:mock-C': makeMockCap('extract_subject', [new Error('fail')]),
        'extract_subject:mock-D': makeMockCap('extract_subject'),
      }) },
    );
    const first = await makeRun();
    const second = await makeRun();
    expect(first.bestPartial).toEqual({ nodeId: 'B', artifactPath: path.join(runDir, 'nB.png') });
    expect(second.bestPartial).toEqual(first.bestPartial);
  });

  it('does not select data nodes as best partial outputs', async () => {
    const result = await executeDag(
      plan([
        { id: 'A', op: 'extract_subject', provider: 'mock-A', params: {}, dependsOn: [], outputKind: 'image' },
        { id: 'B', op: 'analyze_dimensions', provider: 'mock-B', params: { input: '$nodes.A.output' }, dependsOn: ['A'], outputKind: 'data' },
        { id: 'C', op: 'extract_subject', provider: 'mock-C', params: { dims: '$nodes.B.output' }, dependsOn: ['B'], outputKind: 'image' },
      ], 'C'),
      {},
      { runId, runDir, registry: makeRegistry({
        'extract_subject:mock-A': makeMockCap('extract_subject'),
        'analyze_dimensions:mock-B': makeMockCap('analyze_dimensions', [dataResult()]),
        'extract_subject:mock-C': makeMockCap('extract_subject', [new Error('fail')]),
      }) },
    );
    expect(result.bestPartial).toEqual({ nodeId: 'A', artifactPath: path.join(runDir, 'nA.png') });
  });

  it('writes image artifacts with nodeArtifactPath', async () => {
    await executeDag(
      plan([{ id: 'A', op: 'extract_subject', provider: 'mock', params: {}, dependsOn: [], outputKind: 'image' }], 'A'),
      {},
      { runId, runDir, registry: makeRegistry({ 'extract_subject:mock': makeMockCap('extract_subject') }) },
    );
    expect(writeFileAtomicMock).toHaveBeenCalledWith(path.join(runDir, 'nA.png'), Buffer.from('fake-png'));
  });

  it('passes idempotency keys into capability invocations', async () => {
    const cap = makeMockCap('extract_subject');
    await executeDag(
      plan([{ id: 'A', op: 'extract_subject', provider: 'mock', params: {}, dependsOn: [], outputKind: 'image' }], 'A'),
      {},
      { runId, runDir, registry: makeRegistry({ 'extract_subject:mock': cap }) },
    );
    expect(cap.invoke).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: `${runId}:A` }));
  });

  it('passes data outputs into downstream refs without writing artifacts', async () => {
    const capA = makeMockCap('analyze_dimensions', [dataResult()]);
    const capB = makeMockCap('extract_subject');
    await executeDag(
      plan([
        { id: 'A', op: 'analyze_dimensions', provider: 'mock-A', params: {}, dependsOn: [], outputKind: 'data' },
        { id: 'B', op: 'extract_subject', provider: 'mock-B', params: { dims: '$nodes.A.output' }, dependsOn: ['A'], outputKind: 'image' },
      ], 'B'),
      {},
      { runId, runDir, registry: makeRegistry({
        'analyze_dimensions:mock-A': capA,
        'extract_subject:mock-B': capB,
      }) },
    );
    expect(writeFileAtomicMock).toHaveBeenCalledTimes(1);
    expect(capB.invoke).toHaveBeenCalledWith(expect.objectContaining({
      params: { dims: { type: 'dimensions', width: 1, height: 1, format: 'png', channels: 4, hasAlpha: true } },
    }));
  });

  it('runs two independent ready nodes with overlapping wall-clock time', async () => {
    const starts = new Map<string, number>();
    const durationMs = 120;
    const capA = makeDelayedCap('extract_subject', {
      delayMs: durationMs,
      onStart: () => starts.set('A', Date.now()),
    });
    const capB = makeDelayedCap('extract_subject', {
      delayMs: durationMs,
      onStart: () => starts.set('B', Date.now()),
    });
    const capC = makeMockCap('composite_layers');

    await executeDag(
      plan([
        { id: 'A', op: 'extract_subject', provider: 'mock-A', params: {}, dependsOn: [], outputKind: 'image' },
        { id: 'B', op: 'extract_subject', provider: 'mock-B', params: {}, dependsOn: [], outputKind: 'image' },
        {
          id: 'C',
          op: 'composite_layers',
          provider: 'mock-C',
          params: {
            canvas: { width: 1, height: 1 },
            layers: [{ input: '$nodes.A.output' }, { input: '$nodes.B.output' }],
          },
          dependsOn: ['A', 'B'],
          outputKind: 'image',
        },
      ], 'C'),
      {},
      { runId, runDir, registry: makeRegistry({
        'extract_subject:mock-A': capA,
        'extract_subject:mock-B': capB,
        'composite_layers:mock-C': capC,
      }) },
    );

    expect(Math.abs(starts.get('A')! - starts.get('B')!)).toBeLessThan(durationMs / 2);
  });

  it('caps ready-node execution at two in flight', async () => {
    let inflight = 0;
    let maxInflight = 0;
    const makeTracked = (id: string) => makeDelayedCap('extract_subject', {
      delayMs: 80,
      onStart: () => {
        inflight += 1;
        maxInflight = Math.max(maxInflight, inflight);
      },
      onEnd: () => {
        inflight -= 1;
      },
    });
    const caps = Object.fromEntries(
      ['A', 'B', 'C', 'D'].map((id) => [`extract_subject:mock-${id}`, makeTracked(id)]),
    );

    await executeDag(
      plan([
        { id: 'A', op: 'extract_subject', provider: 'mock-A', params: {}, dependsOn: [], outputKind: 'image' },
        { id: 'B', op: 'extract_subject', provider: 'mock-B', params: {}, dependsOn: [], outputKind: 'image' },
        { id: 'C', op: 'extract_subject', provider: 'mock-C', params: {}, dependsOn: [], outputKind: 'image' },
        { id: 'D', op: 'extract_subject', provider: 'mock-D', params: {}, dependsOn: [], outputKind: 'image' },
      ], 'D'),
      {},
      { runId, runDir, registry: makeRegistry(caps) },
    );

    expect(maxInflight).toBe(2);
  });

  it('emits trace nodes in plan order when parallel siblings finish out of order', async () => {
    const result = await executeDag(
      plan([
        { id: 'A', op: 'extract_subject', provider: 'mock-A', params: {}, dependsOn: [], outputKind: 'image' },
        { id: 'B', op: 'extract_subject', provider: 'mock-B', params: {}, dependsOn: [], outputKind: 'image' },
        {
          id: 'C',
          op: 'composite_layers',
          provider: 'mock-C',
          params: {
            canvas: { width: 1, height: 1 },
            layers: [{ input: '$nodes.A.output' }, { input: '$nodes.B.output' }],
          },
          dependsOn: ['A', 'B'],
          outputKind: 'image',
        },
      ], 'C'),
      {},
      { runId, runDir, registry: makeRegistry({
        'extract_subject:mock-A': makeDelayedCap('extract_subject', { delayMs: 90 }),
        'extract_subject:mock-B': makeDelayedCap('extract_subject', { delayMs: 10 }),
        'composite_layers:mock-C': makeMockCap('composite_layers'),
      }) },
    );

    expect(result.trace.nodes.map((node) => node.id)).toEqual(['nA', 'nB', 'nC']);
    expect(result.trace.nodes[0]!.endedAtMs).toBeGreaterThan(result.trace.nodes[1]!.endedAtMs);
  });

  it('does not start descendants until all parents complete', async () => {
    const timings = new Map<string, { start?: number; end?: number }>();
    const markStart = (id: string) => () => timings.set(id, { ...timings.get(id), start: Date.now() });
    const markEnd = (id: string) => () => timings.set(id, { ...timings.get(id), end: Date.now() });

    await executeDag(
      plan([
        { id: 'A', op: 'extract_subject', provider: 'mock-A', params: {}, dependsOn: [], outputKind: 'image' },
        { id: 'B', op: 'extract_subject', provider: 'mock-B', params: {}, dependsOn: [], outputKind: 'image' },
        {
          id: 'C',
          op: 'composite_layers',
          provider: 'mock-C',
          params: {
            canvas: { width: 1, height: 1 },
            layers: [{ input: '$nodes.A.output' }, { input: '$nodes.B.output' }],
          },
          dependsOn: ['A', 'B'],
          outputKind: 'image',
        },
        { id: 'D', op: 'extract_subject', provider: 'mock-D', params: { input: '$nodes.C.output' }, dependsOn: ['C'], outputKind: 'image' },
      ], 'D'),
      {},
      { runId, runDir, registry: makeRegistry({
        'extract_subject:mock-A': makeDelayedCap('extract_subject', { delayMs: 60, onStart: markStart('A'), onEnd: markEnd('A') }),
        'extract_subject:mock-B': makeDelayedCap('extract_subject', { delayMs: 60, onStart: markStart('B'), onEnd: markEnd('B') }),
        'composite_layers:mock-C': makeDelayedCap('composite_layers', { delayMs: 20, onStart: markStart('C'), onEnd: markEnd('C') }),
        'extract_subject:mock-D': makeDelayedCap('extract_subject', { delayMs: 1, onStart: markStart('D'), onEnd: markEnd('D') }),
      }) },
    );

    expect(timings.get('C')!.start).toBeGreaterThanOrEqual(timings.get('A')!.end!);
    expect(timings.get('C')!.start).toBeGreaterThanOrEqual(timings.get('B')!.end!);
    expect(timings.get('D')!.start).toBeGreaterThanOrEqual(timings.get('C')!.end!);
  });

  it('keeps in-flight siblings running when one root fails and skips only descendants', async () => {
    const sibling = makeDelayedCap('extract_subject', { delayMs: 80 });
    const failed = makeDelayedCap('extract_subject', {
      delayMs: 20,
      fail: new CapabilityInvokeError('PROVIDER_FAILURE', 'root failed', false),
    });
    const downstream = makeMockCap('extract_subject');

    const result = await executeDag(
      plan([
        { id: 'A', op: 'extract_subject', provider: 'mock-A', params: {}, dependsOn: [], outputKind: 'image' },
        { id: 'B', op: 'extract_subject', provider: 'mock-B', params: {}, dependsOn: [], outputKind: 'image' },
        { id: 'C', op: 'extract_subject', provider: 'mock-C', params: { input: '$nodes.A.output' }, dependsOn: ['A'], outputKind: 'image' },
      ], 'C'),
      {},
      { runId, runDir, registry: makeRegistry({
        'extract_subject:mock-A': failed,
        'extract_subject:mock-B': sibling,
        'extract_subject:mock-C': downstream,
      }) },
    );

    expect(result.trace.nodes.find((node) => node.id === 'nA')!.outcome).toBe('error');
    expect(result.trace.nodes.find((node) => node.id === 'nB')!.outcome).toBe('success');
    expect(result.trace.nodes.find((node) => node.id === 'nC')!.outcome).toBe('skipped');
    expect(sibling.invoke).toHaveBeenCalledTimes(1);
    expect(downstream.invoke).not.toHaveBeenCalled();
  });

  it('keeps batch siblings running when one node fails validation', async () => {
    const sibling = makeDelayedCap('extract_subject', { delayMs: 40 });
    const invalid = makeDelayedCap('extract_subject', {
      delayMs: 40,
      constraints: { requiresInputImage: true },
    });

    const result = await executeDag(
      plan([
        { id: 'A', op: 'extract_subject', provider: 'mock-A', params: {}, dependsOn: [], outputKind: 'image' },
        { id: 'B', op: 'extract_subject', provider: 'mock-B', params: {}, dependsOn: [], outputKind: 'image' },
      ], 'B'),
      {},
      { runId, runDir, registry: makeRegistry({
        'extract_subject:mock-A': invalid,
        'extract_subject:mock-B': sibling,
      }) },
    );

    expect(result.trace.nodes.find((node) => node.id === 'nA')!.outcome).toBe('error');
    expect(result.trace.nodes.find((node) => node.id === 'nB')!.outcome).toBe('success');
    expect(invalid.invoke).not.toHaveBeenCalled();
    expect(sibling.invoke).toHaveBeenCalledTimes(1);
  });
});
