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
  it('scores alpha-covered foreground pixels', async () => {
    const output = await writePng(
      'alpha.png',
      '<svg width="4" height="4"><rect width="4" height="4" fill="none"/><rect width="2" height="4" fill="black" fill-opacity="0.5"/></svg>',
    );

    const score = await scoreAlphaCoverage(output);

    expect(score.scorer).toBe('alpha_coverage');
    expect(score.status).toBe('scored');
    // 2x4 partially-transparent rectangle over 4x4 transparent canvas: 8/16 = 0.5
    // Asserts exact coverage to detect regressions where transparent pixels are counted.
    expect(score.value).toBe(0.5);
  });

  it('scores opaque hard-mask at correct coverage', async () => {
    // 4x4 transparent background with a 2x4 fully opaque black rectangle = 8/16 pixels covered
    const output = await writePng(
      'hard-mask.png',
      '<svg width="4" height="4"><rect width="4" height="4" fill="none"/><rect width="2" height="4" fill="black" fill-opacity="1"/></svg>',
    );

    const score = await scoreAlphaCoverage(output);

    expect(score.scorer).toBe('alpha_coverage');
    expect(score.status).toBe('scored');
    expect(score.value).toBe(0.5);
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

  it('scores OCR text presence when expected text is found', async () => {
    const output = await writePng(
      'ocr-open.png',
      '<svg width="200" height="80" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="80" fill="white"/><text x="10" y="60" font-size="48" font-family="Arial" fill="black">OPEN</text></svg>',
    );

    const score = await scoreOcrTextPresence(output, 'OPEN');

    expect(score.scorer).toBe('ocr_text_presence');
    expect(score.status).toBe('scored');
    expect(score.value).toBe(1);
  }, 30000);

  it('scores OCR text absence when expected text is missing', async () => {
    const output = await writePng(
      'ocr-open-not-closed.png',
      '<svg width="200" height="80" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="80" fill="white"/><text x="10" y="60" font-size="48" font-family="Arial" fill="black">OPEN</text></svg>',
    );

    const score = await scoreOcrTextPresence(output, 'CLOSED');

    expect(score.scorer).toBe('ocr_text_presence');
    expect(score.status).toBe('scored');
    expect(score.value).toBe(0);
  }, 30000);

  it('errors OCR scoring when expectedText is blank', async () => {
    const score = await scoreOcrTextPresence('unused.png', ' ');

    expect(score.scorer).toBe('ocr_text_presence');
    expect(score.status).toBe('error');
    expect(score.reason).toBe('expectedText is required for OCR scoring');
  });

  it('runs scorers in request order', async () => {
    const input = await writePng(
      'input.png',
      '<svg width="16" height="16"><rect width="16" height="16" fill="white"/></svg>',
    );
    const output = await writePng(
      'output.png',
      '<svg width="200" height="80" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="80" fill="white"/><text x="10" y="60" font-size="48" font-family="Arial" fill="black">OPEN</text></svg>',
    );

    const scores = await runScorers(input, output, ['pixel_delta', 'ocr_text_presence'], {
      expectedText: 'OPEN',
    });

    expect(scores.map((score) => score.scorer)).toEqual([
      'pixel_delta',
      'ocr_text_presence',
    ]);
  }, 30000);
});
