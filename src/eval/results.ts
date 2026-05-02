import * as fs from 'fs/promises';
import * as path from 'path';
import { writeFileAtomic } from '../runs/write.js';
import type { EvalRunResult } from './types.js';

export const EVAL_RESULTS_DIR = path.resolve('eval/results');

export function makeEvalResultFilename(date = new Date()): string {
  return `${date.toISOString().replace(/[:.]/g, '-')}.json`;
}

export async function writeEvalResults(result: EvalRunResult): Promise<string> {
  await fs.mkdir(EVAL_RESULTS_DIR, { recursive: true });
  const resultPath = path.join(EVAL_RESULTS_DIR, makeEvalResultFilename());
  await writeFileAtomic(resultPath, JSON.stringify(result, null, 2));
  return resultPath;
}
