import { manifestPath } from './dir.js';
import { writeFileAtomic } from './write.js';

export interface RunManifestNode {
  id: string;
  op: string;
  provider: string;
  model?: string;
  artifactPath?: string;
  durationMs?: number;
  outcome?: 'success' | 'error' | 'skipped';
  error?: string;
}

export interface RunManifest {
  schemaVersion: 1;
  runId: string;
  startedAt: string;
  endedAt?: string;
  status: 'in_progress' | 'success' | 'error';
  invocation: {
    tool: 'image_op' | 'image_task';
    op?: string;
    provider?: string;
    params?: Record<string, unknown>;
    outputPath?: string;
    outputDir?: string;
    goal?: string;
    inputImages?: Record<string, string>;
    constraints?: { budget_cap_usd?: number; latency_cap_ms?: number };
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
