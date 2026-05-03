import { describe, expect, it } from 'vitest';
import type { Trace, TraceNode } from '../../src/runs/trace.js';
import { ResponseGuardError, serializeImageTaskResponse } from '../../src/task/serialize-response.js';
import type { ExecResult } from '../../src/task/dag-executor.js';
import type { Plan } from '../../src/task/plan-schema.js';

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    version: 1,
    goal: 'remove the background and place this on a clean white studio surface',
    nodes: [
      {
        id: 'extract',
        op: 'extract_subject',
        provider: '@imgly/local',
        params: { input: '$inputs.image_0' },
        dependsOn: [],
        outputKind: 'image',
        costUsd: 0.01,
        latencyMs: 100,
        reason: 'cut out subject',
      },
      {
        id: 'composite',
        op: 'composite_layers',
        provider: 'sharp',
        params: { layers: [{ input: '$nodes.extract.output' }] },
        dependsOn: ['extract'],
        outputKind: 'image',
        costUsd: 0.02,
        latencyMs: 200,
      },
      {
        id: 'transform',
        op: 'transform',
        provider: 'sharp',
        params: { input: '$nodes.composite.output', operations: [{ type: 'resize', width: 2000 }] },
        dependsOn: ['composite'],
        outputKind: 'image',
        costUsd: 0.005,
        latencyMs: 300,
      },
    ],
    terminalNodeId: 'transform',
    estimatedTotalCostUsd: 0.035,
    estimatedTotalLatencyMs: 600,
    ...overrides,
  };
}

function makeTraceNode(overrides: Partial<TraceNode> = {}): TraceNode {
  return {
    id: 'nextract',
    op: 'extract_subject',
    provider: '@imgly/local',
    model: 'local-1',
    artifactPath: '/tmp/x/nextract.png',
    startedAtMs: 0,
    endedAtMs: 100,
    durationMs: 100,
    latencyMs: 100,
    outcome: 'success',
    cost_usd: 0.01,
    inputRefs: [{ field: 'input', ref: '$inputs.image_0', resolvedTo: '/tmp/product.jpg' }],
    ...overrides,
  };
}

function makeDagResult(overrides: Partial<ExecResult> = {}): ExecResult {
  return {
    nodeOutputs: {
      transform: { kind: 'image', artifactPath: '/tmp/x/ntransform.png' },
    },
    trace: {
      runId: 'run_123',
      nodes: [
        makeTraceNode(),
        makeTraceNode({
          id: 'ncomposite',
          op: 'composite_layers',
          provider: 'sharp',
          artifactPath: '/tmp/x/ncomposite.png',
          cost_usd: 0.02,
          latencyMs: 200,
          durationMs: 200,
        }),
        makeTraceNode({
          id: 'ntransform',
          op: 'transform',
          provider: 'sharp',
          artifactPath: '/tmp/x/ntransform.png',
          cost_usd: 0.005,
          latencyMs: 300,
          durationMs: 300,
          revisedPrompt: 'studio product on clean white',
        }),
      ],
      skips: [],
    },
    totals: { cost_usd: 0.035, latency_ms: 600, success: 3, failure: 0, skipped: 0 },
    bestPartial: { nodeId: 'transform', artifactPath: '/tmp/x/ntransform.png' },
    ...overrides,
  };
}

function captureGuardError(fn: () => unknown): ResponseGuardError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ResponseGuardError);
    return error as ResponseGuardError;
  }
  throw new Error('expected ResponseGuardError');
}

describe('serializeImageTaskResponse', () => {
  it('includes plannerMethod=template at the top level when provided', () => {
    const result = serializeImageTaskResponse({
      plan: makePlan(),
      dagResult: makeDagResult(),
      runId: 'run_123',
      plannerMethod: 'template',
    });

    expect(result.plannerMethod).toBe('template');
    expect(result.trace[0]).not.toHaveProperty('plannerMethod');
  });

  it('includes plannerMethod=llm at the top level when provided', () => {
    const result = serializeImageTaskResponse({
      plan: makePlan(),
      dagResult: makeDagResult(),
      runId: 'run_123',
      plannerMethod: 'llm',
    });

    expect(result.plannerMethod).toBe('llm');
    expect(result.trace[0]).not.toHaveProperty('plannerMethod');
  });

  it('omits plannerMethod when not provided', () => {
    const result = serializeImageTaskResponse({
      plan: makePlan(),
      dagResult: makeDagResult(),
      runId: 'run_123',
    });

    expect(result).not.toHaveProperty('plannerMethod');
  });

  it('does not carry plannerMethod on Trace objects', () => {
    const trace: Trace = { runId: 'run_123', nodes: [] };

    expect(Object.keys(trace)).not.toContain('plannerMethod');
  });

  it('Test 1: happy path returns path-only output', () => {
    const result = serializeImageTaskResponse({
      plan: makePlan(),
      dagResult: makeDagResult(),
      runId: 'run_123',
    });

    expect(result).toMatchObject({
      success: true,
      output: { path: '/tmp/x/ntransform.png', mimeType: 'image/png' },
      runId: 'run_123',
      total_cost_usd: 0.035,
      total_latency_ms: 600,
      plan: {
        goal: 'remove the background and place this on a clean white studio surface',
        terminalNodeId: 'transform',
        steps: [
          { id: 'extract', op: 'extract_subject', provider: '@imgly/local', dependsOn: [] },
          { id: 'composite', op: 'composite_layers', provider: 'sharp', dependsOn: ['extract'] },
          { id: 'transform', op: 'transform', provider: 'sharp', dependsOn: ['composite'] },
        ],
      },
    });
    expect(result.trace[0]).toMatchObject({
      id: 'nextract',
      op: 'extract_subject',
      provider: '@imgly/local',
      status: 'success',
      output_path: '/tmp/x/nextract.png',
      cost_usd: 0.01,
      latency_ms: 100,
    });
  });

  it('Test 2: Buffer guard rejects nested metadata buffers', () => {
    const dagResult = makeDagResult({
      trace: {
        runId: 'run_123',
        nodes: [makeTraceNode({ metadata: { thumbnail: Buffer.from([0, 1, 2]) } })],
      },
    });

    const error = captureGuardError(() => serializeImageTaskResponse({
      plan: makePlan(),
      dagResult,
      runId: 'run_123',
    }));
    expect(error.code).toBe('BUFFER_IN_RESPONSE');
    expect(error.jsonPath).toBe('$.trace[0].metadata.thumbnail');
  });

  it('rejects ArrayBuffer and typed array payloads from data node outputs', () => {
    const plan = makePlan({
      nodes: [
        {
          id: 'dimensions',
          op: 'analyze_dimensions',
          provider: 'sharp',
          params: { input: '$inputs.image_0' },
          dependsOn: [],
          outputKind: 'data',
        },
      ],
      terminalNodeId: 'dimensions',
    });
    const traceNode = makeTraceNode({
      id: 'ndimensions',
      op: 'analyze_dimensions',
      provider: 'sharp',
      artifactPath: undefined,
    });

    for (const [payload, expectedPath] of [
      [new ArrayBuffer(8), '$.trace[0].data.raw'],
      [new DataView(new ArrayBuffer(8)), '$.trace[0].data.raw'],
      [new Uint16Array([1, 2]), '$.trace[0].data.raw'],
    ] as const) {
      const dagResult = makeDagResult({
        nodeOutputs: { dimensions: { kind: 'data', data: { raw: payload } } },
        trace: { runId: 'run_123', nodes: [traceNode] },
        bestPartial: null,
      });

      const error = captureGuardError(() => serializeImageTaskResponse({
        plan,
        dagResult,
        runId: 'run_123',
      }));
      expect(error.code).toBe('BUFFER_IN_RESPONSE');
      expect(error.jsonPath).toBe(expectedPath);
    }
  });

  it('Test 3: data URL base64 guard rejects image data URLs', () => {
    const dagResult = makeDagResult({
      trace: {
        runId: 'run_123',
        nodes: [makeTraceNode({ output: 'data:image/png;base64,iVBORw0KGgoAAAA' })],
      },
    });

    const error = captureGuardError(() => serializeImageTaskResponse({
      plan: makePlan(),
      dagResult,
      runId: 'run_123',
    }));
    expect(error.code).toBe('BASE64_IN_RESPONSE');
    expect(error.jsonPath).toBe('$.trace[0].output_path');
  });

  it('Test 4: long base64-looking string guard rejects nested strings', () => {
    const dagResult = makeDagResult({
      trace: {
        runId: 'run_123',
        nodes: [makeTraceNode({ metadata: { raw: 'A'.repeat(1025) } })],
      },
    });

    const error = captureGuardError(() => serializeImageTaskResponse({
      plan: makePlan(),
      dagResult,
      runId: 'run_123',
    }));
    expect(error.code).toBe('BASE64_IN_RESPONSE');
    expect(error.jsonPath).toBe('$.trace[0].metadata.raw');
  });

  it('Test 5: totals come from per-node trace values', () => {
    const result = serializeImageTaskResponse({
      plan: makePlan(),
      dagResult: makeDagResult({
        trace: {
          runId: 'run_123',
          nodes: [
            makeTraceNode({ cost_usd: 0.1, latencyMs: 7 }),
            makeTraceNode({ id: 'ntransform', op: 'transform', provider: 'sharp', cost_usd: 0.2, latencyMs: 11 }),
          ],
        },
      }),
      runId: 'run_123',
    });

    expect(result.total_cost_usd).toBeCloseTo(0.3, 6);
    expect(result.total_latency_ms).toBe(18);
  });

  it('Test 6: revisedPrompt propagates to response trace', () => {
    const result = serializeImageTaskResponse({
      plan: makePlan(),
      dagResult: makeDagResult(),
      runId: 'run_123',
    });

    expect(result.trace.find((node) => node.id === 'ntransform')?.revisedPrompt).toBe(
      'studio product on clean white',
    );
  });

  it('Test 7: plan summary contains only compact step fields', () => {
    const result = serializeImageTaskResponse({
      plan: makePlan(),
      dagResult: makeDagResult(),
      runId: 'run_123',
    });

    expect(Object.keys(result.plan.steps[0]).sort()).toEqual(['dependsOn', 'id', 'op', 'provider']);
  });

  it('Test 8: error envelope includes best partial, failed node, and structured error', () => {
    const dagResult = makeDagResult({
      nodeOutputs: {
        extract: { kind: 'image', artifactPath: '/tmp/x/nextract.png' },
      },
      trace: {
        runId: 'run_123',
        nodes: [
          makeTraceNode({ id: 'nextract', artifactPath: '/tmp/x/nextract.png' }),
          makeTraceNode({
            id: 'ncomposite',
            op: 'composite_layers',
            provider: 'sharp',
            outcome: 'error',
            error: 'fake failure',
            errorDetail: { code: 'PROVIDER_FAILURE', retryable: false, suggestion: 'try later' },
            artifactPath: undefined,
            cost_usd: 0,
          }),
        ],
      },
      totals: { cost_usd: 0.01, latency_ms: 101, success: 1, failure: 1, skipped: 0 },
      bestPartial: { nodeId: 'extract', artifactPath: '/tmp/x/nextract.png' },
    });

    const result = serializeImageTaskResponse({ plan: makePlan(), dagResult, runId: 'run_123' });
    expect(result.success).toBe(false);
    expect(result.bestPartial).toEqual({ nodeId: 'extract', path: '/tmp/x/nextract.png' });
    expect(result.failedNodeId).toBe('composite');
    expect(result.trace.find((node) => node.id === 'ncomposite')).toMatchObject({
      status: 'error',
      error: {
        message: 'fake failure',
        code: 'PROVIDER_FAILURE',
        retryable: false,
        suggestion: 'try later',
      },
    });
  });

  it('Test 9: deep walker visits nested arrays and objects', () => {
    const dagResult = makeDagResult({
      trace: {
        runId: 'run_123',
        nodes: [
          makeTraceNode({
            metadata: { nested: [{ deep: { output: 'data:image/png;base64,XXXX' } }] },
          }),
        ],
      },
    });

    const error = captureGuardError(() => serializeImageTaskResponse({
      plan: makePlan(),
      dagResult,
      runId: 'run_123',
    }));
    expect(error.code).toBe('BASE64_IN_RESPONSE');
    expect(error.jsonPath).toBe('$.trace[0].metadata.nested[0].deep.output');
  });

  it('no field anywhere in the returned JSON contains data:image/', () => {
    const result = serializeImageTaskResponse({
      plan: makePlan(),
      dagResult: makeDagResult(),
      runId: 'run_123',
    });
    const json = JSON.stringify(result);
    expect(json).not.toContain('data:image/');
    expect(/[A-Za-z0-9+/=]{1025,}/.test(json)).toBe(false);
  });
});
