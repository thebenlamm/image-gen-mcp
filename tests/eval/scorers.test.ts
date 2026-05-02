import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  runScorers,
  scoreAlphaCoverage,
  scoreOcrTextPresence,
  scorePixelDelta,
} from '../../src/eval/scorers.js';

let tmpDir: string;

async function writePng(name: string, svg: string): Promise<string> {
  const filePath = path.join(tmpDir, name);
  await sharp(Buffer.from(svg)).png().toFile(filePath);
  return filePath;
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-gen-eval-scorers-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('eval scorers', () => {
  it('scores partial alpha coverage', async () => {
    const output = await writePng(
      'alpha.png',
      '<svg width="4" height="4"><rect width="4" height="4" fill="none"/><rect width="2" height="4" fill="black" fill-opacity="0.5"/></svg>',
    );

    const score = await scoreAlphaCoverage(output);

    expect(score.scorer).toBe('alpha_coverage');
    expect(score.status).toBe('scored');
    expect(score.value).toBeGreaterThan(0);
    expect(score.value).toBeLessThanOrEqual(1);
  });

  it('scores pixel delta between normalized images', async () => {
    const input = await writePng(
      'input.png',
      '<svg width="16" height="16"><rect width="16" height="16" fill="white"/></svg>',
    );
    const output = await writePng(
      'output.png',
      '<svg width="16" height="16"><rect width="16" height="16" fill="black"/></svg>',
    );

    const score = await scorePixelDelta(input, output);

    expect(score.scorer).toBe('pixel_delta');
    expect(score.status).toBe('scored');
    expect(score.value).toBeGreaterThan(0);
  });

  it('keeps OCR scoring as a deterministic placeholder', async () => {
    const score = await scoreOcrTextPresence('unused.png', 'OPEN');

    expect(score).toEqual({
      scorer: 'ocr_text_presence',
      status: 'skipped',
      reason: 'ocr dependency unavailable',
    });
  });

  it('runs scorers in request order', async () => {
    const input = await writePng(
      'input.png',
      '<svg width="16" height="16"><rect width="16" height="16" fill="white"/></svg>',
    );
    const output = await writePng(
      'output.png',
      '<svg width="16" height="16"><rect width="16" height="16" fill="black"/></svg>',
    );

    const scores = await runScorers(input, output, ['pixel_delta', 'ocr_text_presence']);

    expect(scores.map((score) => score.scorer)).toEqual([
      'pixel_delta',
      'ocr_text_presence',
    ]);
  });
});
