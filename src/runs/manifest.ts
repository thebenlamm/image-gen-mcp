import { manifestPath } from './dir.js';
import { writeFileAtomic } from './write.js';

/**
 * Canonical structured error shape shared across the project. Any place
 * that persists or surfaces a failure beyond a plain `error: string` uses
 * this type so the contract has a single source of truth: manifests
 * (`RunManifestNode.errorDetail`), traces (`TraceNode.errorDetail`),
 * `generate_batch` API responses (`BatchItemResult.error`), and the
 * `handleImageOp` failure path.
 *
 * All fields are optional because different writers populate different
 * subsets — e.g. trace nodes have a separate `error: string` field so they
 * leave `message` undefined; `generate_batch` always sets `message`. The
 * type is permissive on purpose; writers should populate everything they
 * have, and readers should optional-chain.
 */
export interface ErrorDetail {
  /** Human-readable rendering of the failure. Populated wherever there's
   *  no companion `error: string` field. */
  message?: string;
  /** From `CapabilityInvokeError.code`. */
  code?: string;
  /** From `CapabilityInvokeError.retryable`. */
  retryable?: boolean;
  /** Original error class name (e.g. 'CapabilityInvokeError', 'TypeError'). */
  errorClass?: string;
  /** From `CapabilityInvokeError.suggestion` (a hint to the caller). */
  suggestion?: string;
}

/**
 * @deprecated Use {@link ErrorDetail}. Retained as an alias so external
 * imports keep compiling; will be removed in the next major version.
 */
export type RunManifestNodeErrorDetail = ErrorDetail;

export interface RunManifestNode {
  id: string;
  op: string;
  provider: string;
  model?: string;
  artifactPath?: string;
  durationMs?: number;
  outcome?: 'success' | 'error' | 'skipped';
  /**
   * Human-readable error rendering. For `generate_batch` failures this is
   * formatted as `"[CODE] message"` when a CapabilityInvokeError code is
   * available, otherwise the plain message. Prefer `errorDetail` for
   * structured access.
   */
  error?: string;
  /** Structured failure detail. Populated when the originating error carries it. */
  errorDetail?: ErrorDetail;
}

export interface RunManifest {
  schemaVersion: 1;
  runId: string;
  startedAt: string;
  endedAt?: string;
  status: 'in_progress' | 'success' | 'partial' | 'error';
  invocation: {
    tool: 'image_op' | 'image_task' | 'generate_batch';
    op?: string;
    provider?: string;
    params?: Record<string, unknown>;
    outputPath?: string;
    outputDir?: string;
    goal?: string;
    inputImages?: Record<string, string>;
    constraints?: { budget_cap_usd?: number; latency_cap_ms?: number };
    batchItems?: Array<{ prompt: string; outputPath?: string }>;
  };
  nodes: RunManifestNode[];
  finalOutput?: string;
  totalDurationMs?: number;
  error?: string;
  plan?: unknown;
  planner?: {
    model?: string;
    tokens?: { input?: number; output?: number };
    latency_ms?: number;
    cost_usd?: number;
  };
  totals?: { cost_usd: number; latency_ms: number; success: number; failure: number; skipped: number };
  bestPartial?: { nodeId: string; artifactPath: string } | null;
}

export async function writeManifest(
  runDir: string,
  manifest: RunManifest,
): Promise<void> {
  const json = JSON.stringify(manifest, null, 2);
  await writeFileAtomic(manifestPath(runDir), json);
}
