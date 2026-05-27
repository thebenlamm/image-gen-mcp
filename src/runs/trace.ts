import type { CapabilityOp } from '../capabilities/types.js';
import type { ErrorDetail } from './manifest.js';

export interface TraceNode {
  id: string;
  op: CapabilityOp | string;
  provider: string;
  model?: string;
  artifactPath?: string;
  output?: string;
  startedAtMs: number;
  endedAtMs: number;
  durationMs: number;
  latencyMs: number;
  outcome: 'success' | 'error' | 'skipped';
  error?: string;
  revisedPrompt?: string;
  cost_usd?: number;
  metadata?: Record<string, unknown>;
  inputRefs?: Array<{ field: string; ref: string; resolvedTo: string }>;
  /** See {@link ErrorDetail}. Trace nodes also have `error: string` for the
   *  human-readable message, so writers typically leave `message` undefined
   *  and populate `code` / `retryable` / `suggestion`. */
  errorDetail?: ErrorDetail;
  attempts?: number;
  skipReason?: string;
}

export interface Trace {
  runId: string;
  nodes: TraceNode[];
  skips?: Array<{ nodeId: string; reason: string }>;
}

export interface BuildTraceNodeInput {
  id: string;
  op: string;
  provider: string;
  model?: string;
  artifactPath?: string;
  output?: string;
  startedAtMs: number;
  endedAtMs: number;
  outcome: 'success' | 'error' | 'skipped';
  error?: string;
  revisedPrompt?: string;
  cost_usd?: number;
  metadata?: Record<string, unknown>;
  inputRefs?: Array<{ field: string; ref: string; resolvedTo: string }>;
  errorDetail?: ErrorDetail;
  attempts?: number;
  skipReason?: string;
}

export function buildTraceNode(input: BuildTraceNodeInput): TraceNode {
  const duration = input.endedAtMs - input.startedAtMs;
  return {
    id: input.id,
    op: input.op,
    provider: input.provider,
    model: input.model,
    artifactPath: input.artifactPath,
    output: input.output,
    startedAtMs: input.startedAtMs,
    endedAtMs: input.endedAtMs,
    durationMs: duration,
    latencyMs: duration,
    outcome: input.outcome,
    error: input.error,
    revisedPrompt: input.revisedPrompt,
    cost_usd: input.cost_usd ?? 0,
    metadata: input.metadata,
    inputRefs: input.inputRefs,
    errorDetail: input.errorDetail,
    attempts: input.attempts,
    skipReason: input.skipReason,
  };
}
