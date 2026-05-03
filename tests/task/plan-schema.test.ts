import { describe, expect, it } from 'vitest';
import { PlanRefSchema, PlanSchema } from '../../src/task/plan-schema.js';

const validNode = {
  id: 'n1',
  op: 'extract_subject' as const,
  provider: '@imgly/local',
  params: { input: '$inputs.product' },
  dependsOn: [],
  outputKind: 'image' as const,
  costUsd: 0,
  latencyMs: 100,
};

const validPlan = {
  version: 1 as const,
  goal: 'extract product',
  nodes: [validNode],
  terminalNodeId: 'n1',
  estimatedTotalCostUsd: 0,
  estimatedTotalLatencyMs: 100,
};

describe('PlanSchema', () => {
  it('parses a minimal valid plan', () => {
    expect(() => PlanSchema.parse(validPlan)).not.toThrow();
  });

  it('rejects invalid output kinds at the node field', () => {
    const result = PlanSchema.safeParse({
      ...validPlan,
      nodes: [{ ...validNode, outputKind: 'video' }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['nodes', 0, 'outputKind']);
    }
  });

  it('rejects malformed node refs', () => {
    expect(PlanRefSchema.safeParse('$nodes.foo.bar').success).toBe(false);
  });

  it('rejects node ids starting with a digit', () => {
    expect(PlanSchema.safeParse({
      ...validPlan,
      nodes: [{ ...validNode, id: '1bad' }],
    }).success).toBe(false);
  });

  it('rejects an empty node list', () => {
    expect(PlanSchema.safeParse({ ...validPlan, nodes: [] }).success).toBe(false);
  });

  it('rejects negative node cost', () => {
    expect(PlanSchema.safeParse({
      ...validPlan,
      nodes: [{ ...validNode, costUsd: -0.001 }],
    }).success).toBe(false);
  });

  it('rejects unsupported schema versions', () => {
    expect(PlanSchema.safeParse({ ...validPlan, version: 2 }).success).toBe(false);
  });

  it('preserves optional node reasoning', () => {
    const plan = PlanSchema.parse({
      ...validPlan,
      nodes: [{ ...validNode, reason: 'Haiku revisedPrompt-style explanation' }],
    });

    expect(plan.nodes[0].reason).toBe('Haiku revisedPrompt-style explanation');
  });
});
