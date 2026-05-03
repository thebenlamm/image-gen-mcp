import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CapabilityInvokeError, type Capability } from '../../src/capabilities/types.js';
import { createRunId } from '../../src/runs/id.js';
import { resolveRunDir } from '../../src/runs/dir.js';
import { executeDag, type ExecPlan } from '../../src/task/dag-executor.js';

function makeCap(op: string, behavior: 'success' | 'fail' = 'success'): Capability {
  return {
    op,
    provider: 'mock',
    modelVersion: 'mock-1',
    constraints: {},
    cost: { perCallUsd: 0 },
    invoke: vi.fn(async () => {
      if (behavior === 'fail') {
        throw new CapabilityInvokeError('PROVIDER_FAILURE', 'mid-DAG forced failure', false);
      }
      return { kind: 'image' as const, buffer: Buffer.from('fake-png'), model: 'mock-1' };
    }),
  } as unknown as Capability;
}

function makeRegistry(capsByKey: Record<string, Capability>) {
  return {
    get: (op: string, provider: string) => capsByKey[`${op}:${provider}`],
  };
}

describe('image_task mid-DAG failure integration', () => {
  let outputRoot: string;
  let previousOutputDir: string | undefined;

  beforeEach(async () => {
    previousOutputDir = process.env.IMAGE_GEN_OUTPUT_DIR;
    outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'image-task-failure-'));
    process.env.IMAGE_GEN_OUTPUT_DIR = outputRoot;
  });

  afterEach(async () => {
    if (previousOutputDir === undefined) {
      delete process.env.IMAGE_GEN_OUTPUT_DIR;
    } else {
      process.env.IMAGE_GEN_OUTPUT_DIR = previousOutputDir;
    }
    await fs.rm(outputRoot, { recursive: true, force: true });
  });

  it('records failed node, skips downstream, and returns best partial', async () => {
    const plan: ExecPlan = {
      goal: 'extract product, composite, transform',
      inputImages: { product: '/fake/product.png', bg: '/fake/bg.png' },
      nodes: [
        { id: 'extract', op: 'extract_subject', provider: 'mock', params: { input: '$inputs.product' }, dependsOn: [], outputKind: 'image', costUsd: 0.01 },
        {
          id: 'composite',
          op: 'composite_layers',
          provider: 'mock',
          params: {
            canvas: { width: 512, height: 512 },
            layers: [{ input: '$inputs.bg' }, { input: '$nodes.extract.output' }],
          },
          dependsOn: ['extract'],
          outputKind: 'image',
          costUsd: 0.02,
        },
        {
          id: 'transform',
          op: 'transform',
          provider: 'mock',
          params: { input: '$nodes.composite.output', operations: [{ type: 'resize', width: 512 }] },
          dependsOn: ['composite'],
          outputKind: 'image',
          costUsd: 0.005,
        },
      ],
      terminalNodeId: 'transform',
    };
    const extract = makeCap('extract_subject');
    const composite = makeCap('composite_layers', 'fail');
    const transform = makeCap('transform');
    const runId = createRunId();
    const runDir = await resolveRunDir(runId);

    const result = await executeDag(plan, plan.inputImages!, {
      runId,
      runDir,
      registry: makeRegistry({
        'extract_subject:mock': extract,
        'composite_layers:mock': composite,
        'transform:mock': transform,
      }),
    });

    expect(result.trace.nodes).toHaveLength(3);
    const compositeNode = result.trace.nodes.find((node) => node.id === 'ncomposite')!;
    expect(compositeNode.outcome).toBe('error');
    expect(compositeNode.error).toMatch(/mid-DAG forced failure/);
    expect(compositeNode.errorDetail).toMatchObject({ code: 'PROVIDER_FAILURE', retryable: false });
    const transformNode = result.trace.nodes.find((node) => node.id === 'ntransform')!;
    expect(transformNode.outcome).toBe('skipped');
    expect(transformNode.skipReason).toMatch(/composite/);
    expect(result.trace.skips).toEqual([{ nodeId: 'transform', reason: 'blocked by composite' }]);
    expect(result.totals).toMatchObject({ success: 1, failure: 1, skipped: 1 });
    expect(result.bestPartial).toEqual({ nodeId: 'extract', artifactPath: path.join(runDir, 'nextract.png') });
    await expect(fs.access(path.join(runDir, 'nextract.png'))).resolves.toBeUndefined();
    expect(transform.invoke).not.toHaveBeenCalled();
    expect(composite.invoke).toHaveBeenCalledTimes(1);
    // MCP response envelope wiring is owned by 09-03; this test covers the executor contract only.
  });
});
