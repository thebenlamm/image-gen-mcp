import * as path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { createAnalyzeOcrCapability } from '../../src/capabilities/analyze-ocr.js';
import { CapabilityInvokeError } from '../../src/capabilities/types.js';
import { terminatePool } from '../../src/utils/ocr.js';

const INPUT = path.resolve('eval/fixtures/text-label.png');

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - started };
}

afterAll(async () => {
  await terminatePool();
});

describe('analyze_ocr capability', () => {
  it('returns OCR text and confidence as a typed data result', async () => {
    const capability = createAnalyzeOcrCapability();

    const result = await capability.invoke({ params: { input: INPUT } });

    expect(result.kind).toBe('data');
    if (result.kind !== 'data') throw new Error('expected data result');
    expect(result.data.type).toBe('ocr');
    if (result.data.type !== 'ocr') throw new Error('expected ocr data');
    expect(result.data.text).toContain('SALE');
    expect(Number.isFinite(result.data.confidence)).toBe(true);
    expect(result.data.confidence).toBeGreaterThan(0);
    expect(result.data.words).toBeUndefined();
    expect(result.metadata).toEqual({ input: INPUT, lang: 'eng' });
  }, 60_000);

  it('includes word bounding boxes when requested', async () => {
    const capability = createAnalyzeOcrCapability();

    const result = await capability.invoke({ params: { input: INPUT, includeWords: true } });

    if (result.kind !== 'data' || result.data.type !== 'ocr') throw new Error('expected ocr data');
    expect(result.data.words).toEqual(expect.any(Array));
    expect(result.data.words?.[0]).toEqual({
      text: expect.any(String),
      confidence: expect.any(Number),
      bbox: [
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
      ],
    });
  }, 60_000);

  it('rejects missing input with CapabilityInvokeError', async () => {
    const capability = createAnalyzeOcrCapability();

    await expect(capability.invoke({ params: {} })).rejects.toBeInstanceOf(CapabilityInvokeError);
    await expect(capability.invoke({ params: {} })).rejects.toMatchObject({
      code: 'CONSTRAINT_VIOLATION',
    });
  });

  it('rejects unsupported OCR languages before pooling', async () => {
    const capability = createAnalyzeOcrCapability();

    await expect(capability.invoke({ params: { input: INPUT, lang: 'spa' } })).rejects.toMatchObject({
      code: 'UNSUPPORTED',
    });
    await expect(capability.invoke({ params: { input: INPUT, lang: 'eng+spa+fra+deu' } })).rejects.toMatchObject({
      code: 'CONSTRAINT_VIOLATION',
    });
  });

  it('uses the pooled worker for repeated invocations', async () => {
    await terminatePool();
    const capability = createAnalyzeOcrCapability();

    const first = await timed(() => capability.invoke({ params: { input: INPUT } }));
    const second = await timed(() => capability.invoke({ params: { input: INPUT } }));

    expect(first.value.kind).toBe('data');
    expect(second.value.kind).toBe('data');
    expect(second.ms).toBeLessThan(first.ms * 0.75);
  }, 60_000);

});
