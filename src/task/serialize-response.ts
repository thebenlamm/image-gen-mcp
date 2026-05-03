import type { TraceNode } from '../runs/trace.js';
import type { ExecResult } from './dag-executor.js';
import type { Plan } from './plan-schema.js';

export class ResponseGuardError extends Error {
  constructor(
    public readonly code: 'BUFFER_IN_RESPONSE' | 'BASE64_IN_RESPONSE',
    public readonly jsonPath: string,
  ) {
    super(`${code} at ${jsonPath}`);
    this.name = 'ResponseGuardError';
  }
}

export interface SerializedImageTaskResponse {
  success: boolean;
  output?: { path: string; mimeType: string; width?: number; height?: number };
  runId: string;
  total_cost_usd: number;
  total_latency_ms: number;
  plan: {
    goal: string;
    terminalNodeId: string;
    steps: Array<{ id: string; op: string; provider: string; dependsOn: string[] }>;
  };
  trace: Array<{
    id: string;
    op: string;
    provider: string;
    model?: string;
    status: 'success' | 'error' | 'skipped';
    inputRefs?: string[];
    output_path?: string;
    data?: unknown;
    metadata?: Record<string, unknown>;
    cost_usd: number;
    latency_ms: number;
    revisedPrompt?: string;
    error?: { message: string; code?: string; retryable?: boolean; suggestion?: string };
  }>;
  skips?: Array<{ nodeId: string; reason: string }>;
  bestPartial?: { nodeId: string; path: string };
  failedNodeId?: string;
}

const DATA_URL_BASE64_RE = /^data:image\/[A-Za-z0-9.+-]+;base64,/;
const BASE64_CHARS_RE = /^[A-Za-z0-9+/=]+$/;

function isPlainObject(value: object): boolean {
  return Object.getPrototypeOf(value) === Object.prototype;
}

export function assertNoBinaryPayload(value: unknown, path = '$', seen = new WeakSet<object>()): void {
  if (value === null || value === undefined) return;

  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    throw new ResponseGuardError('BUFFER_IN_RESPONSE', path);
  }

  if (typeof value === 'string') {
    const compact = value.replace(/\s/g, '');
    if (DATA_URL_BASE64_RE.test(value) || (compact.length > 1024 && BASE64_CHARS_RE.test(compact))) {
      throw new ResponseGuardError('BASE64_IN_RESPONSE', path);
    }
    return;
  }

  if (typeof value !== 'object' || value instanceof Date) return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoBinaryPayload(item, `${path}[${index}]`, seen));
    return;
  }

  if (!isPlainObject(value)) return;

  for (const [key, nested] of Object.entries(value)) {
    assertNoBinaryPayload(nested, `${path}.${key}`, seen);
  }
}

function nodeIdFromTraceId(traceId: string): string {
  return traceId.startsWith('n') ? traceId.slice(1) : traceId;
}

function summarizeInputRefs(node: TraceNode): string[] | undefined {
  if (!node.inputRefs || node.inputRefs.length === 0) return undefined;
  return node.inputRefs.map((inputRef) => inputRef.ref);
}

function traceNodeData(plan: Plan, dagResult: ExecResult, traceNode: TraceNode): unknown {
  const nodeId = nodeIdFromTraceId(traceNode.id);
  const planNode = plan.nodes.find((node) => node.id === nodeId);
  if (planNode?.outputKind !== 'data') return undefined;
  const output = dagResult.nodeOutputs[nodeId];
  return output?.kind === 'data' ? output.data : undefined;
}

function serializeTraceNode(plan: Plan, dagResult: ExecResult, traceNode: TraceNode) {
  const data = traceNodeData(plan, dagResult, traceNode);
  const outputPath = traceNode.output ?? traceNode.artifactPath;
  const serialized = {
    id: traceNode.id,
    op: traceNode.op,
    provider: traceNode.provider,
    ...(traceNode.model !== undefined ? { model: traceNode.model } : {}),
    status: traceNode.outcome,
    ...(summarizeInputRefs(traceNode) !== undefined ? { inputRefs: summarizeInputRefs(traceNode) } : {}),
    ...(outputPath !== undefined ? { output_path: outputPath } : {}),
    ...(data !== undefined ? { data } : {}),
    ...(traceNode.metadata !== undefined ? { metadata: traceNode.metadata } : {}),
    cost_usd: traceNode.cost_usd ?? 0,
    latency_ms: traceNode.latencyMs,
    ...(traceNode.revisedPrompt !== undefined ? { revisedPrompt: traceNode.revisedPrompt } : {}),
    ...(traceNode.outcome === 'error'
      ? {
          error: {
            message: traceNode.error ?? 'Node failed',
            ...(traceNode.errorDetail?.code !== undefined ? { code: traceNode.errorDetail.code } : {}),
            ...(traceNode.errorDetail?.retryable !== undefined ? { retryable: traceNode.errorDetail.retryable } : {}),
            ...(traceNode.errorDetail?.suggestion !== undefined ? { suggestion: traceNode.errorDetail.suggestion } : {}),
          },
        }
      : {}),
  };

  return serialized;
}

function terminalOutput(plan: Plan, dagResult: ExecResult): SerializedImageTaskResponse['output'] | undefined {
  const output = dagResult.nodeOutputs[plan.terminalNodeId];
  if (output?.kind !== 'image') return undefined;
  return { path: output.artifactPath, mimeType: 'image/png' };
}

function failedNodeId(dagResult: ExecResult): string | undefined {
  const failed = dagResult.trace.nodes.find((node) => node.outcome === 'error');
  return failed ? nodeIdFromTraceId(failed.id) : undefined;
}

export function serializeImageTaskResponse(args: {
  plan: Plan;
  dagResult: ExecResult;
  runId: string;
}): SerializedImageTaskResponse {
  const { plan, dagResult, runId } = args;
  const totalCostUsd = dagResult.trace.nodes.reduce((sum, node) => sum + (node.cost_usd ?? 0), 0);
  const totalLatencyMs = dagResult.trace.nodes.reduce((sum, node) => sum + node.latencyMs, 0);
  const failed = failedNodeId(dagResult);
  const response: SerializedImageTaskResponse = {
    success: failed === undefined && (terminalOutput(plan, dagResult) !== undefined || dagResult.trace.nodes.length === 0),
    ...(terminalOutput(plan, dagResult) !== undefined ? { output: terminalOutput(plan, dagResult) } : {}),
    runId,
    total_cost_usd: Number(totalCostUsd.toFixed(6)),
    total_latency_ms: totalLatencyMs,
    plan: {
      goal: plan.goal,
      terminalNodeId: plan.terminalNodeId,
      steps: plan.nodes.map((node) => ({
        id: node.id,
        op: node.op,
        provider: node.provider,
        dependsOn: node.dependsOn,
      })),
    },
    trace: dagResult.trace.nodes.map((node) => serializeTraceNode(plan, dagResult, node)),
    ...(dagResult.trace.skips && dagResult.trace.skips.length > 0 ? { skips: dagResult.trace.skips } : {}),
    ...(dagResult.bestPartial
      ? {
          bestPartial: {
            nodeId: dagResult.bestPartial.nodeId,
            path: dagResult.bestPartial.artifactPath,
          },
        }
      : {}),
    ...(failed !== undefined ? { failedNodeId: failed } : {}),
  };

  assertNoBinaryPayload(response);
  return response;
}
