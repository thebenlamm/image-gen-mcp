import * as fs from 'fs/promises';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import {
  EVAL_RESULTS_DIR,
  makeEvalResultFilename,
  writeEvalResults,
} from '../../src/eval/results.js';
import type { EvalRunResult } from '../../src/eval/types.js';

describe('eval results', () => {
  it('formats timestamped result filenames', () => {
    const filename = makeEvalResultFilename(new Date('2026-05-02T20:31:20.123Z'));

    expect(filename).toBe('2026-05-02T20-31-20-123Z.json');
  });

  it('writes result JSON under eval/results', async () => {
    const result: EvalRunResult = {
      schemaVersion: 1,
      generatedAt: '2026-05-02T20:31:20.123Z',
      results: [],
    };

    const resultPath = await writeEvalResults(result);

    expect(path.dirname(resultPath)).toBe(EVAL_RESULTS_DIR);
    expect(resultPath.endsWith('.json')).toBe(true);
    await expect(fs.readFile(resultPath, 'utf8')).resolves.toContain('"schemaVersion": 1');
    await fs.rm(resultPath, { force: true });
  });
});
