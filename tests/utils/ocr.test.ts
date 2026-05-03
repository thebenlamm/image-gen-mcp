import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import sharp from 'sharp';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scoreOcrTextPresence } from '../../src/eval/scorers.js';
import { recognizeOnce, recognizePooled, terminatePool } from '../../src/utils/ocr.js';

let tmpDir: string;

async function writeTextFixture(): Promise<string> {
  const filePath = path.join(tmpDir, 'ocr-open.png');
  await sharp(Buffer.from(
    '<svg width="260" height="100" xmlns="http://www.w3.org/2000/svg"><rect width="260" height="100" fill="white"/><text x="18" y="72" font-size="56" font-family="Arial" fill="black">OPEN</text></svg>',
  )).png().toFile(filePath);
  return filePath;
}

async function elapsed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - started };
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-gen-ocr-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  await terminatePool();
});

afterAll(async () => {
  await terminatePool();
});

describe('OCR utility', () => {
  it('recognizeOnce returns text and confidence without reusing a pooled worker', async () => {
    const fixture = await writeTextFixture();

    const first = await elapsed(() => recognizeOnce(fixture));
    const second = await elapsed(() => recognizeOnce(fixture));

    expect(first.value.text).toContain('OPEN');
    expect(first.value.confidence).toEqual(expect.any(Number));
    expect(second.value.text).toContain('OPEN');
    expect(second.value.confidence).toEqual(expect.any(Number));
    expect(second.ms).toBeGreaterThan(first.ms * 0.3);
  }, 60_000);

  it('recognizePooled reuses the worker for same-language calls', async () => {
    const fixture = await writeTextFixture();

    const first = await elapsed(() => recognizePooled(fixture));
    const second = await elapsed(() => recognizePooled(fixture));

    expect(first.value.text).toContain('OPEN');
    expect(second.value.text).toContain('OPEN');
    expect(second.ms).toBeLessThan(first.ms * 0.5);
  }, 60_000);

  it('serializes concurrent pooled recognitions for the same language', async () => {
    const fixture = await writeTextFixture();

    const [first, second] = await Promise.all([
      recognizePooled(fixture),
      recognizePooled(fixture),
    ]);

    expect(first.text).toContain('OPEN');
    expect(second.text).toContain('OPEN');
  }, 60_000);

  it('terminatePool clears cached workers', async () => {
    const fixture = await writeTextFixture();

    await recognizePooled(fixture);
    const warm = await elapsed(() => recognizePooled(fixture));
    await terminatePool();
    const cold = await elapsed(() => recognizePooled(fixture));

    expect(warm.value.text).toContain('OPEN');
    expect(cold.value.text).toContain('OPEN');
    expect(cold.ms).toBeGreaterThan(warm.ms * 1.5);
  }, 60_000);

  it('scoreOcrTextPresence still scores via the shared utility', async () => {
    const fixture = await writeTextFixture();

    const score = await scoreOcrTextPresence(fixture, 'OPEN');

    expect(score).toMatchObject({
      scorer: 'ocr_text_presence',
      status: 'scored',
      value: 1,
    });
  }, 60_000);
});
