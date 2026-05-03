import type { CapabilityRegistry } from '../capabilities/registry.js';
import { capabilityRegistry } from '../capabilities/registry.js';
import type { Capability } from '../capabilities/types.js';
import { validateCapabilityParams } from '../capabilities/validation.js';
import { assertWithinInputRoot, InputRootViolation } from '../utils/path-input-root.js';
import type { Plan, PlanNode } from './plan-schema.js';
import { PlanRefSchema } from './plan-schema.js';

export interface ValidationContext {
  inputImages: Record<string, string>;
  constraints: {
    budget_cap_usd?: number;
    latency_cap_seconds?: number;
    output_size?: 'square' | 'landscape' | 'portrait';
  };
  registry: CapabilityRegistry;
}

export interface ValidationError {
  code: string;
  message: string;
  nodeId?: string;
  field?: string;
  suggestion?: string;
}

export interface PlanValidationFailure {
  ok: false;
  errors: ValidationError[];
  plan?: Plan;
  estimated_cost_usd?: number;
  budget_cap_usd?: number;
}

export interface PlanValidationSuccess {
  ok: true;
  plan: Plan;
  recomputedCostUsd: number;
  recomputedLatencyMs: number;
  criticalPathMs: number;
}

const INPUT_REF_RE = /^\$inputs\.([A-Za-z_][A-Za-z0-9_]*)$/;
const NODE_REF_RE = /^\$nodes\.([A-Za-z_][A-Za-z0-9_]*)\.output$/;
const EXPECTED_OUTPUT_KIND = {
  extract_subject: 'image',
  edit_prompt: 'image',
  composite_layers: 'image',
  transform: 'image',
  enhance_upscale: 'image',
  analyze_dimensions: 'data',
  analyze_palette: 'data',
  analyze_ocr: 'data',
  generate: 'image',
} as const satisfies Record<PlanNode['op'], 'image' | 'data'>;

interface StringParam {
  node: PlanNode;
  field: string;
  value: string;
}

function visitStrings(value: unknown, field: string, out: Array<{ field: string; value: string }>): void {
  if (typeof value === 'string') {
    out.push({ field, value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitStrings(item, `${field}[${index}]`, out));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      visitStrings(nested, field ? `${field}.${key}` : key, out);
    }
  }
}

function collectStringParams(plan: Plan): StringParam[] {
  return plan.nodes.flatMap((node) => {
    const strings: Array<{ field: string; value: string }> = [];
    visitStrings(node.params, 'params', strings);
    return strings.map((entry) => ({ node, ...entry }));
  });
}

function imageInputFields(node: PlanNode): Array<{ field: string; value: unknown }> {
  if (node.op === 'composite_layers') {
    const layers = node.params.layers;
    if (!Array.isArray(layers)) {
      return [];
    }
    return layers.map((layer, index) => ({
      field: `params.layers[${index}].input`,
      value: (layer as Record<string, unknown>).input,
    }));
  }

  return [{ field: 'params.input', value: node.params.input }];
}

function substitutePlanRefs(value: unknown): unknown {
  if (typeof value === 'string' && PlanRefSchema.safeParse(value).success) {
    return '<runtime-image-path>';
  }
  if (Array.isArray(value)) {
    return value.map(substitutePlanRefs);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, substitutePlanRefs(nested)]),
    );
  }
  return value;
}

function topologicalSort(nodes: PlanNode[]): { order: string[]; cycle: string[] | null } {
  const indegree = new Map<string, number>(nodes.map((node) => [node.id, 0]));
  const adjacency = new Map<string, string[]>(nodes.map((node) => [node.id, []]));

  for (const node of nodes) {
    for (const depId of node.dependsOn) {
      adjacency.get(depId)!.push(node.id);
      indegree.set(node.id, indegree.get(node.id)! + 1);
    }
  }

  const ready: string[] = [];
  for (const [id, degree] of indegree) {
    if (degree === 0) ready.push(id);
  }

  const order: string[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    order.push(id);
    for (const nextId of adjacency.get(id)!) {
      const newDegree = indegree.get(nextId)! - 1;
      indegree.set(nextId, newDegree);
      if (newDegree === 0) ready.push(nextId);
    }
  }

  if (order.length !== nodes.length) {
    const cycle = [...indegree.entries()]
      .filter(([, degree]) => degree > 0)
      .map(([id]) => id);
    return { order: [], cycle };
  }

  return { order, cycle: null };
}

function computeCriticalPathMs(plan: Plan): { criticalPathMs: number; criticalPathNodeIds: string[] } {
  const nodeById = new Map(plan.nodes.map((node) => [node.id, node]));
  const memo = new Map<string, { ms: number; path: string[] }>();

  function pathTo(nodeId: string): { ms: number; path: string[] } {
    const cached = memo.get(nodeId);
    if (cached) return cached;

    const node = nodeById.get(nodeId)!;
    let bestParent = { ms: 0, path: [] as string[] };
    for (const depId of node.dependsOn) {
      const candidate = pathTo(depId);
      if (candidate.ms > bestParent.ms) {
        bestParent = candidate;
      }
    }

    const result = {
      ms: bestParent.ms + node.latencyMs,
      path: [...bestParent.path, node.id],
    };
    memo.set(node.id, result);
    return result;
  }

  let best = { ms: 0, path: [] as string[] };
  for (const node of plan.nodes) {
    const candidate = pathTo(node.id);
    if (candidate.ms > best.ms) {
      best = candidate;
    }
  }

  return { criticalPathMs: best.ms, criticalPathNodeIds: best.path };
}

function warnOrphanBranches(plan: Plan): void {
  const depsByNode = new Map(plan.nodes.map((node) => [node.id, node.dependsOn]));
  const reachable = new Set<string>();
  const queue = [plan.terminalNodeId];

  while (queue.length) {
    const nodeId = queue.shift()!;
    if (reachable.has(nodeId)) continue;
    reachable.add(nodeId);
    queue.push(...(depsByNode.get(nodeId) ?? []));
  }

  const orphanIds = plan.nodes.map((node) => node.id).filter((id) => !reachable.has(id));
  if (orphanIds.length > 0) {
    console.warn(`PLAN_ORPHAN_BRANCH: ${orphanIds.join(', ')}`);
  }
}

export async function validatePlan(
  plan: Plan,
  ctx: ValidationContext = {
    inputImages: {},
    constraints: {},
    registry: capabilityRegistry,
  },
): Promise<PlanValidationSuccess | PlanValidationFailure> {
  // Pass 1: schema parsing is performed by PlanSchema.parse before this function is called.
  const errors: ValidationError[] = [];
  const strings = collectStringParams(plan);
  const nodeById = new Map(plan.nodes.map((node) => [node.id, node]));

  for (const { node, field, value } of strings) {
    if (value.startsWith('$') && !PlanRefSchema.safeParse(value).success) {
      errors.push({
        code: 'PLAN_INVALID_REF',
        message: `Invalid plan reference '${value}'`,
        nodeId: node.id,
        field,
        suggestion: 'Use $inputs.<name> or $nodes.<id>.output.',
      });
    }
  }

  for (const { node, field, value } of strings) {
    const inputMatch = INPUT_REF_RE.exec(value);
    if (inputMatch && !(inputMatch[1] in ctx.inputImages)) {
      errors.push({
        code: 'PLAN_UNKNOWN_REF',
        message: `Unknown input reference '${value}'`,
        nodeId: node.id,
        field,
      });
    }

    const nodeMatch = NODE_REF_RE.exec(value);
    if (nodeMatch && !nodeById.has(nodeMatch[1])) {
      errors.push({
        code: 'PLAN_UNKNOWN_REF',
        message: `Unknown node reference '${value}'`,
        nodeId: node.id,
        field,
      });
    } else if (nodeMatch && !node.dependsOn.includes(nodeMatch[1])) {
      errors.push({
        code: 'PLAN_MISSING_DEP',
        message: `Node '${node.id}' references '${value}' but does not depend on '${nodeMatch[1]}'`,
        nodeId: node.id,
        field,
        suggestion: `Add '${nodeMatch[1]}' to dependsOn.`,
      });
    }
  }

  for (const node of plan.nodes) {
    const expected = EXPECTED_OUTPUT_KIND[node.op];
    if (node.outputKind !== expected) {
      errors.push({
        code: 'PLAN_OUTPUT_KIND_MISMATCH',
        message: `Node '${node.id}' op '${node.op}' must declare outputKind '${expected}'`,
        nodeId: node.id,
        field: 'outputKind',
      });
    }
  }

  for (const node of plan.nodes) {
    for (const { field, value } of imageInputFields(node)) {
      if (typeof value !== 'string') continue;
      const nodeMatch = NODE_REF_RE.exec(value);
      if (!nodeMatch) continue;
      const referenced = nodeById.get(nodeMatch[1]);
      if (referenced?.outputKind === 'data') {
        errors.push({
          code: 'PLAN_REF_TYPE_MISMATCH',
          message: `${field} requires an image output but '${value}' points to data`,
          nodeId: node.id,
          field,
        });
      }
    }
  }

  for (const [inputName, inputPath] of Object.entries(ctx.inputImages)) {
    try {
      await assertWithinInputRoot(inputPath);
    } catch (error) {
      errors.push({
        code: 'INPUT_PATH_OUTSIDE_ROOT',
        message: error instanceof Error ? error.message : String(error),
        field: `$inputs.${inputName}`,
        suggestion: 'Place input files under IMAGE_GEN_INPUT_ROOT or unset IMAGE_GEN_INPUT_ROOT.',
      });
    }
  }

  const nodeIds = new Set(plan.nodes.map((node) => node.id));
  for (const node of plan.nodes) {
    for (const depId of node.dependsOn) {
      if (!nodeIds.has(depId)) {
        return {
          ok: false,
          plan,
          errors: [{
            code: 'PLAN_UNKNOWN_DEP',
            message: `Node '${node.id}' depends on unknown node '${depId}'`,
            nodeId: node.id,
            field: 'dependsOn',
          }],
        };
      }
    }
  }

  const sorted = topologicalSort(plan.nodes);
  if (sorted.cycle) {
    return {
      ok: false,
      plan,
      errors: [{
        code: 'PLAN_CYCLE_DETECTED',
        message: `Plan contains a dependency cycle involving: ${sorted.cycle.join(', ')}`,
      }],
    };
  }

  const terminal = nodeById.get(plan.terminalNodeId);
  if (!terminal) {
    return {
      ok: false,
      plan,
      errors: [{
        code: 'TERMINAL_INVALID',
        message: `terminalNodeId '${plan.terminalNodeId}' does not exist`,
        field: 'terminalNodeId',
      }],
    };
  }
  if (terminal.outputKind !== 'image') {
    return {
      ok: false,
      plan,
      errors: [{
        code: 'TERMINAL_INVALID',
        message: `terminalNodeId '${plan.terminalNodeId}' must point to an image node`,
        nodeId: terminal.id,
        field: 'terminalNodeId',
      }],
    };
  }
  warnOrphanBranches(plan);

  const caps = new Map<string, Capability>();
  for (const node of plan.nodes) {
    const cap = ctx.registry.get(node.op, node.provider);
    if (!cap) {
      const providers = ctx.registry.list(node.op).map((candidate) => candidate.provider);
      errors.push({
        code: 'CAPABILITY_NOT_REGISTERED',
        message: `Capability '${node.op}' is not registered for provider '${node.provider}'`,
        nodeId: node.id,
        field: '(op,provider)',
        suggestion: providers.length
          ? `Registered providers for ${node.op}: ${providers.join(', ')}`
          : `No providers registered for ${node.op}.`,
      });
    } else {
      caps.set(node.id, cap);
    }
  }

  for (const node of plan.nodes) {
    const cap = caps.get(node.id);
    if (!cap) continue;
    try {
      validateCapabilityParams(cap, substitutePlanRefs(node.params) as Record<string, unknown>);
    } catch (error) {
      errors.push({
        code: 'PARAM_INVALID',
        message: error instanceof Error ? error.message : String(error),
        nodeId: node.id,
        field: 'params',
      });
    }
  }

  for (const node of plan.nodes) {
    for (const { field, value } of imageInputFields(node)) {
      if (typeof value !== 'string' || PlanRefSchema.safeParse(value).success) {
        continue;
      }
      try {
        await assertWithinInputRoot(value);
      } catch (error) {
        errors.push({
          code: 'INPUT_PATH_OUTSIDE_ROOT',
          message: error instanceof Error ? error.message : String(error),
          nodeId: node.id,
          field,
          suggestion: 'Place input files under IMAGE_GEN_INPUT_ROOT or unset IMAGE_GEN_INPUT_ROOT.',
        });
        if (!(error instanceof InputRootViolation)) {
          continue;
        }
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, plan, errors };
  }

  const recomputedCostUsd = plan.nodes.reduce((sum, node) => sum + node.costUsd, 0);
  const recomputedLatencyMs = plan.nodes.reduce((sum, node) => sum + node.latencyMs, 0);
  if (
    Math.abs(plan.estimatedTotalCostUsd - recomputedCostUsd) /
      Math.max(recomputedCostUsd, 0.001) >
    0.20
  ) {
    console.warn(
      `COST_ESTIMATE_DRIFT: planner estimated ${plan.estimatedTotalCostUsd}, recomputed ${recomputedCostUsd}`,
    );
  }

  if (
    ctx.constraints.budget_cap_usd !== undefined &&
    recomputedCostUsd > ctx.constraints.budget_cap_usd
  ) {
    const gapUsd = recomputedCostUsd - ctx.constraints.budget_cap_usd;
    return {
      ok: false,
      plan,
      estimated_cost_usd: recomputedCostUsd,
      budget_cap_usd: ctx.constraints.budget_cap_usd,
      errors: [{
        code: 'BUDGET_CAP_EXCEEDED',
        message: `Estimated plan cost ${recomputedCostUsd} exceeds budget cap ${ctx.constraints.budget_cap_usd}; gap_usd=${gapUsd}`,
        suggestion: 'Raise budget_cap_usd or request a cheaper plan.',
      }],
    };
  }

  const { criticalPathMs, criticalPathNodeIds } = computeCriticalPathMs(plan);
  if (
    ctx.constraints.latency_cap_seconds !== undefined &&
    criticalPathMs > ctx.constraints.latency_cap_seconds * 1000
  ) {
    return {
      ok: false,
      plan,
      errors: [{
        code: 'LATENCY_CAP_EXCEEDED',
        message: `Critical path latency ${criticalPathMs}ms exceeds latency cap ${ctx.constraints.latency_cap_seconds * 1000}ms across ${criticalPathNodeIds.join(' -> ')}`,
        suggestion: 'Raise latency_cap_seconds or request a faster plan.',
      }],
    };
  }

  return {
    ok: true,
    plan,
    recomputedCostUsd,
    recomputedLatencyMs,
    criticalPathMs,
  };
}
