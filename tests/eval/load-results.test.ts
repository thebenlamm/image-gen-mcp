import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_EVAL_RESULTS_DIR, EVAL_RESULTS_DIR, loadLatestEvalResults } from '../../src/eval/results.js';

let dir: string;
beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'eval-results-')); });
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

function run(status: 'scored' | 'error', generatedAt: string) {
  return { schemaVersion: 1, generatedAt, results: [{ caseId: 'c1', op: 'generate', provider: 'p', modelVersion: 'm', status, scores: [] }] };
}

describe('loadLatestEvalResults', () => {
  it('resolves the default results dir from the module, not cwd', () => {
    expect(DEFAULT_EVAL_RESULTS_DIR).toBe(path.resolve(__dirname, '../../eval/results'));
  });

  it('tests run against a temp results dir, never the real one the server loads', () => {
    expect(EVAL_RESULTS_DIR).not.toBe(DEFAULT_EVAL_RESULTS_DIR);
    expect(EVAL_RESULTS_DIR.startsWith(os.tmpdir())).toBe(true);
  });

  it('returns null when the directory does not exist', async () => {
    expect(await loadLatestEvalResults(path.join(dir, 'missing'))).toBeNull();
  });

  it('picks the newest run with no errored cases', async () => {
    await fs.writeFile(path.join(dir, '2026-01-01T00-00-00-000Z.json'), JSON.stringify(run('scored', 'old')));
    await fs.writeFile(path.join(dir, '2026-02-01T00-00-00-000Z.json'), JSON.stringify(run('scored', 'mid')));
    await fs.writeFile(path.join(dir, '2026-03-01T00-00-00-000Z.json'), JSON.stringify(run('error', 'new-failed')));
    const loaded = await loadLatestEvalResults(dir);
    expect(loaded?.result.generatedAt).toBe('mid');
    expect(loaded?.path).toBe(path.join(dir, '2026-02-01T00-00-00-000Z.json'));
  });

  it('throws on a malformed result file instead of silently dropping scores', async () => {
    await fs.writeFile(path.join(dir, '2026-01-01T00-00-00-000Z.json'), JSON.stringify({ nope: true }));
    await expect(loadLatestEvalResults(dir)).rejects.toThrow(/schemaVersion 1/);
  });
});
