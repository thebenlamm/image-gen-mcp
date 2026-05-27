import { manifestPath } from './dir.js';
import { writeFileAtomic } from './write.js';

/**
 * Structured error detail persisted with a manifest node when the invocation
 * failed. The string `error` field above keeps a human-readable rendering
 * (currently formatted as `"[CODE] message"` by `generate_batch` for
 * backwards-compatible log scraping). New consumers should prefer
 * `errorDetail` and route on `code` / `retryable` directly — that's stable
 * structured data, the `[CODE]` prefix in `error` is a rendering choice and
 * may change.
 */
export interface RunManifestNodeErrorDetail {
  message: string;
  /** CapabilityInvokeErrorCode when the underlying failure was a CapabilityInvokeError. */
  code?: string;
  /** Whether the failure would be safe for a caller to retry. */
  retryable?: boolean;
  /** Original error class name (e.g. 'CapabilityInvokeError', 'TypeError'). */
  errorClass?: string;
}

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
  errorDetail?: RunManifestNodeErrorDetail;
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
