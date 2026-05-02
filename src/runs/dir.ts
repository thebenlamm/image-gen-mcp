import * as path from 'path';
import * as fs from 'fs/promises';
import { getOutputDir } from '../utils/image.js';
import { RUN_ID_REGEX } from './id.js';

export const RUN_DIR_NAME = '.runs';

export function isValidRunId(runId: string): boolean {
  return RUN_ID_REGEX.test(runId);
}

export async function resolveRunsRoot(): Promise<string> {
  const outputDir = await getOutputDir();
  const runsRoot = path.join(outputDir, RUN_DIR_NAME);
  await fs.mkdir(runsRoot, { recursive: true });
  return runsRoot;
}

export async function resolveRunDir(runId: string): Promise<string> {
  if (!isValidRunId(runId)) {
    throw new Error(`Invalid runId: '${runId}' does not match expected format`);
  }

  const root = await resolveRunsRoot();
  const runDir = path.join(root, runId);
  const resolvedRoot = path.resolve(root);
  const resolvedRunDir = path.resolve(runDir);

  if (!resolvedRunDir.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`runId resolved outside runs root: ${runId}`);
  }

  await fs.mkdir(runDir, { recursive: true });
  return runDir;
}

export function nodeArtifactPath(runDir: string, nodeId: string): string {
  if (/[\\/]|\.\./.test(nodeId)) {
    throw new Error(`Invalid nodeId: '${nodeId}'`);
  }
  return path.join(runDir, `n${nodeId}.png`);
}

export function manifestPath(runDir: string): string {
  return path.join(runDir, 'manifest.json');
}
