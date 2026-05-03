import { capabilityRegistry } from '../capabilities/registry.js';
import {
  CapabilityInvokeError,
  type Capability,
  type CapabilityInvokeResult,
  type CapabilityOp,
} from '../capabilities/types.js';
import { validateCapabilityParams } from '../capabilities/validation.js';
import { nodeArtifactPath } from '../runs/dir.js';
import { buildTraceNode, type Trace, type TraceNode } from '../runs/trace.js';
import { writeFileAtomic } from '../runs/write.js';
import { selectBestPartial, type NodeOutcome } from './best-partial.js';
import { resolveRefs, type NodeOutput, type ResolveCtx } from './ref-resolver.js';
import { MAX_PARALLEL_NODES } from './sharp-config.js';
import './sharp-config.js';

export interface ExecPlan {
  goal: string;
  inputImages?: Record<string, string>;
  constraints?: { budget_cap_usd?: number; latency_cap_ms?: number };
  nodes: Array<{
    id: string;
    op: string;
    provider: string;
    params: Record<string, unknown>;
    dependsOn: string[];
    outputKind: 'image' | 'data';
    costUsd?: number;
    latencyMs?: number;
    reason?: string;
  }>;
  terminalNodeId: string;
}

export interface ExecCtx {
  runId: string;
  runDir: string;
  registry?: { get: (op: string, provider: string) => Capability | undefined };
}

export interface ExecResult {
  nodeOutputs: Record<string, NodeOutput>;
  trace: Trace;
  totals: { cost_usd: number; latency_ms: number; success: number; failure: number; skipped: number };
  bestPartial: { nodeId: string; artifactPath: string } | null;
}

const INPUT_REF_RE = /^\$inputs\.([A-Za-z_][A-Za-z0-9_]*)$/;
const NODE_REF_RE = /^\$nodes\.([A-Za-z_][A-Za-z0-9_]*)\.output$/;

type ExecNode = ExecPlan['nodes'][number];

function buildResolveCtx(inputs: Record<string, string>, outcomes: Map<string, NodeOutcome>): ResolveCtx {
  return {
    inputs,
    nodeOutputs: Object.fromEntries(
      [...outcomes.entries()]
        .filter(([, outcome]) => outcome.status === 'success' && outcome.output)
        .map(([nodeId, outcome]) => [nodeId, outcome.output as NodeOutput]),
    ),
  };
}

function valueToInputRefString(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function collectInputRefs(
  rawValue: unknown,
  resolvedValue: unknown,
  field: string,
  out: Array<{ field: string; ref: string; resolvedTo: string }>,
): void {
  if (typeof rawValue === 'string' && (INPUT_REF_RE.test(rawValue) || NODE_REF_RE.test(rawValue))) {
    out.push({ field, ref: rawValue, resolvedTo: valueToInputRefString(resolvedValue) });
    return;
  }

  if (Array.isArray(rawValue) && Array.isArray(resolvedValue)) {
    rawValue.forEach((item, index) => {
      collectInputRefs(item, resolvedValue[index], field ? `${field}.${index}` : String(index), out);
    });
    return;
  }

  if (
    rawValue !== null &&
    resolvedValue !== null &&
    typeof rawValue === 'object' &&
    typeof resolvedValue === 'object' &&
    Object.getPrototypeOf(rawValue) === Object.prototype &&
    Object.getPrototypeOf(resolvedValue) === Object.prototype
  ) {
    for (const [key, nested] of Object.entries(rawValue)) {
      collectInputRefs(
        nested,
        (resolvedValue as Record<string, unknown>)[key],
        field ? `${field}.${key}` : key,
        out,
      );
    }
  }
}

function sanitizedMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => {
      return !Buffer.isBuffer(value) && !ArrayBuffer.isView(value) && !(value instanceof ArrayBuffer);
    }),
  );
}

function errorDetailFrom(error: unknown): { code: string; retryable: boolean; suggestion?: string } | undefined {
  if (!(error instanceof CapabilityInvokeError)) return undefined;
  return {
    code: error.code,
    retryable: error.retryable,
    suggestion: error.suggestion,
  };
}

function makeErrorTraceNode(
  node: ExecNode,
  startedAtMs: number,
  error: unknown,
  attempts?: number,
): TraceNode {
  const message = error instanceof Error ? error.message : String(error);
  return buildTraceNode({
    id: `n${node.id}`,
    op: node.op,
    provider: node.provider,
    startedAtMs,
    endedAtMs: Date.now(),
    outcome: 'error',
    error: message,
    errorDetail: errorDetailFrom(error),
    cost_usd: 0,
    attempts,
  });
}

async function runNodeWithRetry(
  cap: Capability,
  node: ExecNode,
  resolvedParams: Record<string, unknown>,
  ctx: ExecCtx,
): Promise<
  | { status: 'success'; result: CapabilityInvokeResult; traceNode: TraceNode; attempts: number }
  | { status: 'error'; traceNode: TraceNode; attempts: number }
> {
  const startedAtMs = Date.now();
  let lastError: unknown;
  let attempts = 0;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    attempts = attempt;
    try {
      const result = await cap.invoke({
        params: resolvedParams,
        idempotencyKey: `${ctx.runId}:${node.id}`,
      });
      const endedAtMs = Date.now();
      const traceNode = buildTraceNode({
        id: `n${node.id}`,
        op: node.op,
        provider: node.provider,
        model: result.model,
        startedAtMs,
        endedAtMs,
        outcome: 'success',
        revisedPrompt: result.kind === 'image' ? result.revisedPrompt : undefined,
        cost_usd: node.costUsd ?? 0,
        metadata: sanitizedMetadata(result.metadata),
        attempts,
      });
      return { status: 'success', result, traceNode, attempts };
    } catch (err) {
      lastError = err;
      if (attempt === 1 && err instanceof CapabilityInvokeError && err.retryable === true) {
        continue;
      }
      break;
    }
  }

  return {
    status: 'error',
    traceNode: makeErrorTraceNode(node, startedAtMs, lastError, attempts),
    attempts,
  };
}

function skipDownstream(
  failedNodeId: string,
  adjacency: Map<string, string[]>,
  nodeById: Map<string, ExecNode>,
  outcomes: Map<string, NodeOutcome>,
  traceNodes: TraceNode[],
  skips: Array<{ nodeId: string; reason: string }>,
): void {
  const queue = [...(adjacency.get(failedNodeId) ?? [])];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    queue.push(...(adjacency.get(nodeId) ?? []));
    if (outcomes.has(nodeId)) continue;

    const node = nodeById.get(nodeId);
    if (!node) continue;

    const reason = `blocked by ${failedNodeId}`;
    outcomes.set(nodeId, { status: 'skipped' });
    skips.push({ nodeId, reason });
    const now = Date.now();
    traceNodes.push(buildTraceNode({
      id: `n${node.id}`,
      op: node.op,
      provider: node.provider,
      startedAtMs: now,
      endedAtMs: now,
      outcome: 'skipped',
      cost_usd: 0,
      skipReason: reason,
    }));
  }
}

export async function executeDag(
  plan: ExecPlan,
  inputs: Record<string, string>,
  ctx: ExecCtx,
): Promise<ExecResult> {
  if (!ctx.runId || !ctx.runDir) {
    throw new Error('executeDag requires ctx.runId and ctx.runDir');
  }

  const registry = ctx.registry ?? capabilityRegistry;
  const nodeById = new Map(plan.nodes.map((node) => [node.id, node]));
  const indegree = new Map(plan.nodes.map((node) => [node.id, node.dependsOn.length]));
  const adjacency = new Map(plan.nodes.map((node) => [node.id, [] as string[]]));

  for (const node of plan.nodes) {
    for (const depId of node.dependsOn) {
      adjacency.get(depId)?.push(node.id);
    }
  }

  const outcomes = new Map<string, NodeOutcome>();
  const traceNodes: TraceNode[] = [];
  const skips: Array<{ nodeId: string; reason: string }> = [];
  const ready = plan.nodes.filter((node) => node.dependsOn.length === 0).map((node) => node.id);

  async function processNode(nodeId: string): Promise<void> {
    if (outcomes.has(nodeId)) return;

    const node = nodeById.get(nodeId);
    if (!node) return;

    const resolveCtx = buildResolveCtx(inputs, outcomes);
    let resolvedParams: Record<string, unknown>;
    let inputRefs: Array<{ field: string; ref: string; resolvedTo: string }> = [];

    try {
      resolvedParams = resolveRefs(node.params, resolveCtx) as Record<string, unknown>;
      collectInputRefs(node.params, resolvedParams, '', inputRefs);
    } catch (err) {
      const traceNode = makeErrorTraceNode(node, Date.now(), err, 0);
      outcomes.set(node.id, { status: 'error' });
      traceNodes.push(traceNode);
      skipDownstream(node.id, adjacency, nodeById, outcomes, traceNodes, skips);
      return;
    }

    const cap = registry.get(node.op as CapabilityOp, node.provider);
    if (!cap) {
      const error = new Error(`Capability ${node.op}:${node.provider} not registered`);
      const traceNode = makeErrorTraceNode(node, Date.now(), error, 0);
      traceNode.inputRefs = inputRefs;
      outcomes.set(node.id, { status: 'error' });
      traceNodes.push(traceNode);
      skipDownstream(node.id, adjacency, nodeById, outcomes, traceNodes, skips);
      return;
    }

    try {
      validateCapabilityParams(cap, resolvedParams);
    } catch (err) {
      const traceNode = makeErrorTraceNode(node, Date.now(), err, 0);
      traceNode.inputRefs = inputRefs;
      outcomes.set(node.id, { status: 'error' });
      traceNodes.push(traceNode);
      skipDownstream(node.id, adjacency, nodeById, outcomes, traceNodes, skips);
      return;
    }

    const runResult = await runNodeWithRetry(cap, node, resolvedParams, ctx);
    runResult.traceNode.inputRefs = inputRefs;

    if (runResult.status === 'success') {
      let output: NodeOutput;
      if (runResult.result.kind === 'image') {
        const artifactPath = nodeArtifactPath(ctx.runDir, node.id);
        await writeFileAtomic(artifactPath, runResult.result.buffer);
        runResult.traceNode.artifactPath = artifactPath;
        output = { kind: 'image', artifactPath };
      } else {
        output = { kind: 'data', data: runResult.result.data };
      }

      outcomes.set(node.id, { status: 'success', output });
      traceNodes.push(runResult.traceNode);
      for (const downstreamId of adjacency.get(node.id) ?? []) {
        const nextDegree = (indegree.get(downstreamId) ?? 0) - 1;
        indegree.set(downstreamId, nextDegree);
        if (nextDegree === 0) ready.push(downstreamId);
      }
      return;
    }

    outcomes.set(node.id, { status: 'error' });
    traceNodes.push(runResult.traceNode);
    skipDownstream(node.id, adjacency, nodeById, outcomes, traceNodes, skips);
  }

  while (ready.length > 0) {
    const batch: string[] = [];
    while (batch.length < MAX_PARALLEL_NODES && ready.length > 0) {
      const id = ready.shift()!;
      if (outcomes.has(id)) continue;
      batch.push(id);
    }
    if (batch.length === 0) break;

    // Mutations after awaits are still single-threaded in Node; indegree is what
    // prevents ancestors and descendants from entering the same ready batch.
    await Promise.all(batch.map((id) => processNode(id)));
  }

  const nodeOutputs = Object.fromEntries(
    [...outcomes.entries()]
      .filter(([, outcome]) => outcome.status === 'success' && outcome.output)
      .map(([nodeId, outcome]) => [nodeId, outcome.output as NodeOutput]),
  );
  const totals = traceNodes.reduce(
    (acc, traceNode) => {
      if (traceNode.outcome === 'success') {
        acc.success += 1;
        acc.cost_usd += traceNode.cost_usd ?? 0;
        acc.latency_ms += traceNode.latencyMs;
      } else if (traceNode.outcome === 'error') {
        acc.failure += 1;
        acc.latency_ms += traceNode.latencyMs;
      } else {
        acc.skipped += 1;
      }
      return acc;
    },
    { cost_usd: 0, latency_ms: 0, success: 0, failure: 0, skipped: 0 },
  );
  totals.cost_usd = Number(totals.cost_usd.toFixed(6));

  return {
    nodeOutputs,
    trace: { runId: ctx.runId, nodes: traceNodes, skips },
    totals,
    bestPartial: selectBestPartial(plan, outcomes),
  };
}
