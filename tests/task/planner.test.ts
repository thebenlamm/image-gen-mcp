import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CapabilityOp } from '../../src/capabilities/types.js';
import type { Plan } from '../../src/task/plan-schema.js';

const mockCreate = vi.fn();
const constructorOptions: unknown[] = [];

class MockAuthenticationError extends Error {
  constructor() {
    super('auth');
    this.name = 'AuthenticationError';
  }
}

class MockRateLimitError extends Error {}

class MockAPIError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'APIError';
  }
}

class MockBadRequestError extends Error {}

class MockTimeoutError extends Error {}

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockCreate };
    constructor(opts: unknown) {
      constructorOptions.push(opts);
    }
  },
  AuthenticationError: MockAuthenticationError,
  RateLimitError: MockRateLimitError,
  APIError: MockAPIError,
  BadRequestError: MockBadRequestError,
  APIConnectionTimeoutError: MockTimeoutError,
}));

const validPlan: Plan = {
  version: 1,
  goal: 'extract product',
  nodes: [{
    id: 'n1',
    op: 'extract_subject',
    provider: '@imgly/local',
    params: { input: '$inputs.product' },
    dependsOn: [],
    outputKind: 'image',
    costUsd: 0,
    latencyMs: 100,
  }],
  terminalNodeId: 'n1',
  estimatedTotalCostUsd: 0,
  estimatedTotalLatencyMs: 100,
};

function registry() {
  const caps = [{
    op: 'extract_subject' as CapabilityOp,
    provider: '@imgly/local',
    modelVersion: '@imgly/background-removal-node@1',
    constraints: { requiresInputImage: true },
    cost: { perCallUsd: 0 },
    latencyMsP50: 100,
    quality: { scores: { alpha: 1 } },
    async invoke() {
      throw new Error('not invoked');
    },
  }];
  return {
    list() {
      return caps;
    },
    get(op: CapabilityOp, provider: string) {
      return caps.find((cap) => cap.op === op && cap.provider === provider);
    },
  };
}

describe('planImageTask', () => {
  beforeEach(() => {
    vi.resetModules();
    mockCreate.mockReset();
    constructorOptions.length = 0;
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('returns a parsed plan with reasoning and usage', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(validPlan) }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    const { planImageTask } = await import('../../src/task/planner.js');

    const result = await planImageTask({ goal: 'extract product', inputImages: { product: '/tmp/x.png' } }, registry() as never);

    expect(result.plan).toEqual(validPlan);
    expect(result.reasoning).toBe('');
    expect(result.usage).toEqual({ promptTokens: 100, completionTokens: 50 });
  });

  it('throws PLANNER_AUTH before SDK construction when the key is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { planImageTask } = await import('../../src/task/planner.js');

    await expect(planImageTask({ goal: 'x' }, registry() as never)).rejects.toMatchObject({
      code: 'PLANNER_AUTH',
    });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(constructorOptions).toHaveLength(0);
  });

  it('maps SDK authentication errors to PLANNER_AUTH', async () => {
    mockCreate.mockRejectedValue(new MockAuthenticationError());
    const { planImageTask } = await import('../../src/task/planner.js');

    await expect(planImageTask({ goal: 'x' }, registry() as never)).rejects.toMatchObject({
      code: 'PLANNER_AUTH',
    });
  });

  it('maps timeout-like API errors to retryable PLANNER_TIMEOUT', async () => {
    mockCreate.mockRejectedValue(new MockAPIError('timeout', 0));
    const { planImageTask } = await import('../../src/task/planner.js');

    await expect(planImageTask({ goal: 'x' }, registry() as never)).rejects.toMatchObject({
      code: 'PLANNER_TIMEOUT',
      retryable: true,
    });
  });

  it('maps invalid JSON responses to PLANNER_PARSE', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not json' }],
      usage: {},
    });
    const { planImageTask } = await import('../../src/task/planner.js');

    await expect(planImageTask({ goal: 'x' }, registry() as never)).rejects.toMatchObject({
      code: 'PLANNER_PARSE',
    });
  });

  it('maps defensive schema validation failures to PLANNER_INVALID_PLAN', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ invalid: 'shape' }) }],
      usage: {},
    });
    const { planImageTask } = await import('../../src/task/planner.js');

    await expect(planImageTask({ goal: 'x' }, registry() as never)).rejects.toMatchObject({
      code: 'PLANNER_INVALID_PLAN',
    });
  });

  it('sends the capability snapshot in the system prompt', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(validPlan) }],
      usage: {},
    });
    const { planImageTask } = await import('../../src/task/planner.js');

    await planImageTask({ goal: 'extract product' }, registry() as never);

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      system: expect.stringContaining('@imgly/local'),
    }));
  });

  it('requests plain JSON without Anthropic structured output so params can be op-specific', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(validPlan) }],
      usage: {},
    });
    const { planImageTask } = await import('../../src/task/planner.js');

    await planImageTask({ goal: 'extract product' }, registry() as never);

    expect(mockCreate).toHaveBeenCalledWith(expect.not.objectContaining({
      output_config: expect.anything(),
    }));
  });

  it('instructs routing notes to surface no incumbent and missing quality decisions', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(validPlan) }],
      usage: {},
    });
    const { planImageTask } = await import('../../src/task/planner.js');

    await planImageTask({ goal: 'extract product' }, registry() as never);

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      system: expect.stringContaining('no incumbent comparison'),
    }));
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      system: expect.stringContaining('routingNotes[i].measuredQuality'),
    }));
  });
});
