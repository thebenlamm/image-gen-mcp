import { manifestPath } from './dir.js';
import { writeFileAtomic } from './write.js';

export interface RunManifestNode {
  id: string;
  op: string;
  provider: string;
  model?: string;
  artifactPath?: string;
  durationMs?: number;
  outcome?: 'success' | 'error';
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
    op: string;
    provider: string;
    params: Record<string, unknown>;
    outputPath?: string;
    outputDir?: string;
  };
  nodes: RunManifestNode[];
  finalOutput?: string;
  totalDurationMs?: number;
  error?: string;
}

export async function writeManifest(
  runDir: string,
  manifest: RunManifest,
): Promise<void> {
  const json = JSON.stringify(manifest, null, 2);
  await writeFileAtomic(manifestPath(runDir), json);
}
