import * as fs from 'fs/promises';
import * as path from 'path';
import { isValidRunId, resolveRunsRoot } from './dir.js';

export const DEFAULT_RETENTION_HOURS = 24;

export function parseRetentionHours(raw: string | undefined | null): number {
  if (raw === undefined || raw === null) return DEFAULT_RETENTION_HOURS;

  const trimmed = String(raw).trim();
  if (trimmed === '') return DEFAULT_RETENTION_HOURS;

  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) {
    console.error(
      `Warning: IMAGE_GEN_RUN_RETENTION_HOURS='${raw}' is invalid (must be a non-negative number). Using default ${DEFAULT_RETENTION_HOURS}.`,
    );
    return DEFAULT_RETENTION_HOURS;
  }

  return n;
}

export interface SweepResult {
  scanned: number;
  deleted: number;
  skipped: number;
  errors: Array<{ runDir: string; error: string }>;
}

export async function sweepRunArtifacts(
  retentionHours: number,
  now: number = Date.now(),
): Promise<SweepResult> {
  const result: SweepResult = { scanned: 0, deleted: 0, skipped: 0, errors: [] };
  const cutoff = now - retentionHours * 60 * 60 * 1000;

  let root: string;
  try {
    root = await resolveRunsRoot();
  } catch {
    return result;
  }

  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return result;
  }

  // Startup-only sweep; force removal handles TOCTOU ENOENT without crashing.
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      result.skipped += 1;
      continue;
    }
    if (entry.isSymbolicLink()) {
      result.skipped += 1;
      continue;
    }
    if (!isValidRunId(entry.name)) {
      result.skipped += 1;
      continue;
    }

    result.scanned += 1;
    const runDir = path.join(root, entry.name);

    try {
      const stat = await fs.lstat(runDir);
      if (stat.isSymbolicLink()) {
        result.skipped += 1;
        continue;
      }
      if (retentionHours > 0 && stat.mtimeMs >= cutoff) continue;

      await fs.rm(runDir, { recursive: true, force: true });
      result.deleted += 1;
    } catch (err) {
      result.errors.push({
        runDir,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
