import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { writeFileAtomic } from '../runs/write.js';
import type { EvalRunResult } from './types.js';

// Resolved from this module (src/eval or dist/eval), not process.cwd(), so the
// server finds results regardless of where it was launched from.
export const EVAL_RESULTS_DIR = fileURLToPath(new URL('../../eval/results', import.meta.url));

export function makeEvalResultFilename(date = new Date()): string {
  return `${date.toISOString().replace(/[:.]/g, '-')}.json`;
}

export async function writeEvalResults(result: EvalRunResult): Promise<string> {
  await fs.mkdir(EVAL_RESULTS_DIR, { recursive: true });
  const resultPath = path.join(EVAL_RESULTS_DIR, makeEvalResultFilename());
  await writeFileAtomic(resultPath, JSON.stringify(result, null, 2));
  return resultPath;
}

/**
 * Newest eval result file whose run had no errored cases (a failed `npm run
 * eval` writes its JSON but never applies it — same rule here). Returns null
 * when the directory does not exist or holds no usable run. Malformed files
 * throw: a corrupt result must not silently disable eval-gated routing.
 */
export async function loadLatestEvalResults(
  dir: string = EVAL_RESULTS_DIR,
): Promise<{ result: EvalRunResult; path: string } | null> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  const files = entries.filter((name) => name.endsWith('.json')).sort().reverse();
  for (const name of files) {
    const filePath = path.join(dir, name);
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as EvalRunResult;
    if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.results)) {
      throw new Error(`Eval result ${filePath} is not a schemaVersion 1 EvalRunResult`);
    }
    if (parsed.results.some((entry) => entry.status === 'error')) continue;
    return { result: parsed, path: filePath };
  }
  return null;
}
