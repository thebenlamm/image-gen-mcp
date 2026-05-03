import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Capability, CapabilityOp } from '../../src/capabilities/types.js';
import type { Plan, PlanNode } from '../../src/task/plan-schema.js';
import { validatePlan } from '../../src/task/plan-validator.js';

function capability(op: CapabilityOp, provider: string, requiresInputImage = true): Capability {
  return {
    op,
    provider,
    modelVersion: `${provider}@test`,
    constraints: { requiresInputImage },
    cost: { perCallUsd: 0 },
    async invoke() {
      throw new Error('not invoked');
    },
  };
}

function mockRegistry(caps: Capability[]) {
  return {
    get(op: CapabilityOp, provider: string) {
      return caps.find((cap) => cap.op === op && cap.provider === provider);
    },
    list(op?: CapabilityOp) {
      return op ? caps.filter((cap) => cap.op === op) : caps;
    },
  };
}

const baseNode: PlanNode = {
  id: 'n1',
  op: 'extract_subject',
  provider: '@imgly/local',
  params: { input: '$inputs.product' },
  dependsOn: [],
  outputKind: 'image',
  costUsd: 0.01,
  latencyMs: 100,
};

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    version: 1,
    goal: 'test goal',
    nodes: [baseNode],
    terminalNodeId: 'n1',
    estimatedTotalCostUsd: 0.01,
    estimatedTotalLatencyMs: 100,
    ...overrides,
  };
}

const registry = mockRegistry([
  capability('extract_subject', '@imgly/local'),
  capability('edit_prompt', 'openai'),
  capability('analyze_dimensions', 'sharp'),
  capability('analyze_ocr', 'tesseract'),
]);

async function validate(plan: Plan, inputImages: Record<string, string> = { product: '/tmp/product.png' }) {
  return validatePlan(plan, { inputImages, constraints: {}, registry: registry as never });
}

afterEach(() => {
  delete process.env.IMAGE_GEN_INPUT_ROOT;
});

describe('validatePlan', () => {
  it('collects PLAN_INVALID_REF for malformed refs', async () => {
    const result = await validate(makePlan({
      nodes: [{ ...baseNode, params: { input: '$inputs' } }],
    }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((error) => error.code === 'PLAN_INVALID_REF')).toBe(true);
  });

  it('collects PLAN_UNKNOWN_REF for missing input refs', async () => {
    const result = await validate(makePlan(), {});

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].code).toBe('PLAN_UNKNOWN_REF');
  });

  it('collects PLAN_UNKNOWN_REF for missing node refs', async () => {
    const result = await validate(makePlan({
      nodes: [{ ...baseNode, params: { input: '$nodes.foo.output' } }],
    }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((error) => error.code === 'PLAN_UNKNOWN_REF')).toBe(true);
  });

  it('returns PLAN_MISSING_DEP when a node references another node output without dependsOn', async () => {
    const extract: PlanNode = {
      ...baseNode,
      id: 'extract',
      op: 'extract_subject',
      provider: '@imgly/local',
      params: { input: '$inputs.product' },
      dependsOn: [],
      outputKind: 'image',
    };
    const edit: PlanNode = {
      ...baseNode,
      id: 'edit',
      op: 'edit_prompt',
      provider: 'openai',
      params: { input: '$nodes.extract.output', prompt: 'clean background' },
      dependsOn: [],
      outputKind: 'image',
    };

    const result = await validate(makePlan({
      nodes: [extract, edit],
      terminalNodeId: 'edit',
    }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual(expect.objectContaining({
        code: 'PLAN_MISSING_DEP',
        nodeId: 'edit',
        field: 'params.input',
        message: expect.stringContaining("depend on 'extract'"),
      }));
    }
  });

  it('returns PLAN_OUTPUT_KIND_MISMATCH when analyze_dimensions lies as image', async () => {
    const result = await validate(makePlan({
      nodes: [{
        ...baseNode,
        op: 'analyze_dimensions',
        provider: 'sharp',
        params: { input: '$inputs.product' },
        dependsOn: [],
        outputKind: 'image',
      }],
    }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual(expect.objectContaining({
        code: 'PLAN_OUTPUT_KIND_MISMATCH',
        nodeId: 'n1',
        field: 'outputKind',
        message: expect.stringContaining("must declare outputKind 'data'"),
      }));
    }
  });

  it('collects PLAN_REF_TYPE_MISMATCH for data refs in image fields', async () => {
    const dataNode: PlanNode = {
      id: 'ocr',
      op: 'analyze_ocr',
      provider: 'tesseract',
      params: { input: '$inputs.product' },
      dependsOn: [],
      outputKind: 'data',
      costUsd: 0,
      latencyMs: 50,
    };
    const imageNode = { ...baseNode, id: 'subject', params: { input: '$nodes.ocr.output' }, dependsOn: ['ocr'] };
    const result = await validate(makePlan({
      nodes: [dataNode, imageNode],
      terminalNodeId: 'subject',
    }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((error) => error.code === 'PLAN_REF_TYPE_MISMATCH')).toBe(true);
  });

  it('returns PLAN_CYCLE_DETECTED for cycles', async () => {
    const a = { ...baseNode, id: 'a', dependsOn: ['b'] };
    const b = { ...baseNode, id: 'b', dependsOn: ['a'] };
    const result = await validate(makePlan({ nodes: [a, b], terminalNodeId: 'a' }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].code).toBe('PLAN_CYCLE_DETECTED');
  });

  it('returns PLAN_UNKNOWN_DEP for unknown dependencies', async () => {
    const result = await validate(makePlan({
      nodes: [{ ...baseNode, dependsOn: ['ghost'] }],
    }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].code).toBe('PLAN_UNKNOWN_DEP');
  });

  it('returns TERMINAL_INVALID when terminal is data', async () => {
    const result = await validate(makePlan({
      nodes: [{
        ...baseNode,
        op: 'analyze_dimensions',
        provider: 'sharp',
        outputKind: 'data',
      }],
    }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].code).toBe('TERMINAL_INVALID');
  });

  it('collects CAPABILITY_NOT_REGISTERED for unknown provider', async () => {
    const result = await validate(makePlan({
      nodes: [{ ...baseNode, provider: 'imagined-co' }],
    }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((error) => error.code === 'CAPABILITY_NOT_REGISTERED')).toBe(true);
  });

  it('collects PARAM_INVALID from validateCapabilityParams', async () => {
    const result = await validate(makePlan({
      nodes: [{
        ...baseNode,
        op: 'edit_prompt',
        provider: 'openai',
        params: { input: '$inputs.product' },
      }],
    }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.code === 'PARAM_INVALID' && /prompt/.test(error.message))).toBe(true);
    }
  });

  it('collects INPUT_PATH_OUTSIDE_ROOT for literal paths outside the root', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'validator-root-'));
    const root = path.join(tmp, 'root');
    await fs.mkdir(root);
    process.env.IMAGE_GEN_INPUT_ROOT = root;
    const result = await validate(makePlan({
      nodes: [{ ...baseNode, params: { input: path.join(tmp, 'outside.png') } }],
    }));
    await fs.rm(tmp, { recursive: true, force: true });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((error) => error.code === 'INPUT_PATH_OUTSIDE_ROOT')).toBe(true);
  });

  it('collects INPUT_PATH_OUTSIDE_ROOT for ctx.inputImages referenced by dry-run plans', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'validator-root-'));
    const root = path.join(tmp, 'root');
    const outside = path.join(tmp, 'outside.png');
    await fs.mkdir(root);
    await fs.writeFile(outside, 'not really an image');
    process.env.IMAGE_GEN_INPUT_ROOT = root;
    const result = await validate(makePlan(), { product: outside });
    await fs.rm(tmp, { recursive: true, force: true });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual(expect.objectContaining({
        code: 'INPUT_PATH_OUTSIDE_ROOT',
        field: '$inputs.product',
      }));
    }
  });

  it('returns BUDGET_CAP_EXCEEDED with budget details', async () => {
    const result = await validatePlan(makePlan({
      nodes: [{ ...baseNode, costUsd: 0.05 }],
      estimatedTotalCostUsd: 0.05,
    }), {
      inputImages: { product: '/tmp/product.png' },
      constraints: { budget_cap_usd: 0.005 },
      registry: registry as never,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].code).toBe('BUDGET_CAP_EXCEEDED');
      expect(result.estimated_cost_usd).toBeCloseTo(0.05, 5);
      expect(result.budget_cap_usd).toBe(0.005);
      expect(result.errors[0].message).toMatch(/0\.045/);
    }
  });

  it('returns LATENCY_CAP_EXCEEDED for slow critical paths', async () => {
    const result = await validatePlan(makePlan({
      nodes: [{ ...baseNode, latencyMs: 12_000 }],
      estimatedTotalLatencyMs: 12_000,
    }), {
      inputImages: { product: '/tmp/product.png' },
      constraints: { latency_cap_seconds: 10 },
      registry: registry as never,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].code).toBe('LATENCY_CAP_EXCEEDED');
  });

  it('returns a validated plan with recomputed cost and latency', async () => {
    const result = await validate(makePlan());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.terminalNodeId).toBe('n1');
      expect(result.recomputedCostUsd).toBe(0.01);
      expect(result.recomputedLatencyMs).toBe(100);
      expect(result.criticalPathMs).toBe(100);
    }
  });
});
