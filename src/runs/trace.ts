import type { CapabilityOp } from '../capabilities/types.js';

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
  outcome: 'success' | 'error';
  error?: string;
  revisedPrompt?: string;
  cost_usd?: number;
  metadata?: Record<string, unknown>;
}

export interface Trace {
  runId: string;
  nodes: TraceNode[];
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
  outcome: 'success' | 'error';
  error?: string;
  revisedPrompt?: string;
  cost_usd?: number;
  metadata?: Record<string, unknown>;
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
  };
}
