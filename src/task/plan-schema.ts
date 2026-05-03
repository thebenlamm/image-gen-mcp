import { z } from 'zod';

const InputRef = z.string().regex(/^\$inputs\.[A-Za-z_][A-Za-z0-9_]*$/, {
  message: 'must be $inputs.<name>',
});

const NodeRef = z.string().regex(/^\$nodes\.[A-Za-z_][A-Za-z0-9_]*\.output$/, {
  message: 'must be $nodes.<id>.output',
});

export const PlanRefSchema = z.union([InputRef, NodeRef]);

export const PlanNodeParamsSchema = z.record(z.unknown());

export const PlanNodeSchema = z.object({
  id: z.string().regex(/^[A-Za-z_][A-Za-z0-9_-]{0,31}$/),
  op: z.enum([
    'extract_subject',
    'edit_prompt',
    'composite_layers',
    'transform',
    'enhance_upscale',
    'analyze_dimensions',
    'analyze_palette',
    'analyze_ocr',
    'generate',
  ]),
  provider: z.string().min(1),
  params: PlanNodeParamsSchema,
  dependsOn: z.array(z.string()).default([]),
  outputKind: z.enum(['image', 'data']),
  costUsd: z.number().nonnegative(),
  latencyMs: z.number().nonnegative(),
  reason: z.string().max(500).optional(),
});

export const PlanSchema = z.object({
  version: z.literal(1),
  goal: z.string(),
  nodes: z.array(PlanNodeSchema).min(1).max(32),
  terminalNodeId: z.string(),
  estimatedTotalCostUsd: z.number().nonnegative(),
  estimatedTotalLatencyMs: z.number().nonnegative(),
  routingNotes: z.array(z.object({
    nodeId: z.string(),
    measuredQuality: z.boolean(),
    rationale: z.string().max(200),
  })).optional(),
});

export type Plan = z.infer<typeof PlanSchema>;
export type PlanNode = z.infer<typeof PlanNodeSchema>;
