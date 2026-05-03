import type { Mock } from 'vitest';
import { vi } from 'vitest';
import type { Capability, CapabilityInvokeResult, CapabilityOp } from '../../../src/capabilities/types.js';
import type { Plan } from '../../../src/task/plan-schema.js';

export function make1pxPng(): Buffer {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
    0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x60, 0x00, 0x00, 0x00,
    0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
}

export function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    version: 1,
    goal: 'remove the background and place this on a clean white studio surface, 2000px square',
    nodes: [
      {
        id: 'extract',
        op: 'extract_subject',
        provider: 'mock-e2e',
        params: { input: '$inputs.image_0' },
        dependsOn: [],
        outputKind: 'image',
        costUsd: 0.01,
        latencyMs: 100,
      },
      {
        id: 'composite',
        op: 'composite_layers',
        provider: 'mock-e2e',
        params: {
          canvas: { width: 1, height: 1 },
          layers: [{ input: '$nodes.extract.output' }],
        },
        dependsOn: ['extract'],
        outputKind: 'image',
        costUsd: 0.02,
        latencyMs: 200,
      },
      {
        id: 'transform',
        op: 'transform',
        provider: 'mock-e2e',
        params: { input: '$nodes.composite.output', operations: [{ type: 'resize', width: 1 }] },
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

export async function importHandleImageTaskWithPlanner(plan: Plan) {
  vi.resetModules();
  vi.doMock('../../../src/task/index.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../src/task/index.js')>();
    return {
      ...actual,
      planImageTask: vi.fn(async () => ({
        plan,
        reasoning: 'mocked planner',
        usage: { promptTokens: 12, completionTokens: 34 },
        latencyMs: 5,
      })),
    };
  });

  const [{ handleImageTask }, { capabilityRegistry, CapabilityInvokeError }] = await Promise.all([
    import('../../../src/index.js'),
    import('../../../src/capabilities/index.js'),
  ]);

  return { handleImageTask, capabilityRegistry, CapabilityInvokeError };
}

export function registerMockCapabilities(
  capabilityRegistry: { register: (capability: Capability, options?: { allowUnscoredProduction?: boolean }) => void },
  overrides: Partial<Record<CapabilityOp, Mock<() => Promise<CapabilityInvokeResult>>>> = {},
) {
  const mockInvoke = vi.fn(async () => ({
    kind: 'image' as const,
    buffer: make1pxPng(),
    model: 'mock-model',
    revisedPrompt: 'mock revised prompt',
  }));

  for (const op of ['extract_subject', 'composite_layers', 'transform'] as CapabilityOp[]) {
    const invoke = overrides[op] ?? mockInvoke;
    capabilityRegistry.register({
      op,
      provider: 'mock-e2e',
      modelVersion: 'mock-model',
      constraints: op === 'extract_subject' ? { requiresInputImage: true } : {},
      cost: { perCallUsd: 0 },
      latencyMsP50: 1,
      quality: { scores: { e2e: 1 } },
      invoke,
    });
  }

  return { mockInvoke };
}

export function cleanupMocks(): void {
  vi.doUnmock('../../../src/task/index.js');
  vi.restoreAllMocks();
}
