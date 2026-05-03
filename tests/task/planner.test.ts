import { ZodError } from 'zod';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CapabilityOp } from '../../src/capabilities/types.js';
import type { Plan } from '../../src/task/plan-schema.js';

const mockParse = vi.fn();
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
    messages = { parse: mockParse };
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

vi.mock('@anthropic-ai/sdk/helpers/zod', () => ({
  zodOutputFormat: (schema: unknown) => ({ schema }),
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
    mockParse.mockReset();
    constructorOptions.length = 0;
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('returns a parsed plan with reasoning and usage', async () => {
    mockParse.mockResolvedValue({
      parsed_output: validPlan,
      content: [{ type: 'text', text: 'reasoning prose' }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    const { planImageTask } = await import('../../src/task/planner.js');

    const result = await planImageTask({ goal: 'extract product', inputImages: { product: '/tmp/x.png' } }, registry() as never);

    expect(result.plan).toEqual(validPlan);
    expect(result.reasoning).toBe('reasoning prose');
    expect(result.usage).toEqual({ promptTokens: 100, completionTokens: 50 });
  });

  it('throws PLANNER_AUTH before SDK construction when the key is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { planImageTask } = await import('../../src/task/planner.js');

    await expect(planImageTask({ goal: 'x' }, registry() as never)).rejects.toMatchObject({
      code: 'PLANNER_AUTH',
    });
    expect(mockParse).not.toHaveBeenCalled();
    expect(constructorOptions).toHaveLength(0);
  });

  it('maps SDK authentication errors to PLANNER_AUTH', async () => {
    mockParse.mockRejectedValue(new MockAuthenticationError());
    const { planImageTask } = await import('../../src/task/planner.js');

    await expect(planImageTask({ goal: 'x' }, registry() as never)).rejects.toMatchObject({
      code: 'PLANNER_AUTH',
    });
  });

  it('maps timeout-like API errors to retryable PLANNER_TIMEOUT', async () => {
    mockParse.mockRejectedValue(new MockAPIError('timeout', 0));
    const { planImageTask } = await import('../../src/task/planner.js');

    await expect(planImageTask({ goal: 'x' }, registry() as never)).rejects.toMatchObject({
      code: 'PLANNER_TIMEOUT',
      retryable: true,
    });
  });

  it('maps Zod helper parse failures to PLANNER_PARSE', async () => {
    mockParse.mockRejectedValue(new ZodError([]));
    const { planImageTask } = await import('../../src/task/planner.js');

    await expect(planImageTask({ goal: 'x' }, registry() as never)).rejects.toMatchObject({
      code: 'PLANNER_PARSE',
    });
  });

  it('maps defensive schema validation failures to PLANNER_INVALID_PLAN', async () => {
    mockParse.mockResolvedValue({
      parsed_output: { invalid: 'shape' },
      content: [],
      usage: {},
    });
    const { planImageTask } = await import('../../src/task/planner.js');

    await expect(planImageTask({ goal: 'x' }, registry() as never)).rejects.toMatchObject({
      code: 'PLANNER_INVALID_PLAN',
    });
  });

  it('sends the capability snapshot in the system prompt', async () => {
    mockParse.mockResolvedValue({
      parsed_output: validPlan,
      content: [],
      usage: {},
    });
    const { planImageTask } = await import('../../src/task/planner.js');

    await planImageTask({ goal: 'extract product' }, registry() as never);

    expect(mockParse).toHaveBeenCalledWith(expect.objectContaining({
      system: expect.stringContaining('@imgly/local'),
    }));
  });
});
