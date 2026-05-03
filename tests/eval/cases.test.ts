import { describe, expect, it } from 'vitest';
import { loadEvalCases } from '../../src/eval/cases.js';

describe('eval cases loader', () => {
  it('preserves expectedText for edit-text-label', async () => {
    const cases = await loadEvalCases();
    const labelCase = cases.find((c) => c.id === 'edit-text-label');

    expect(labelCase).toBeDefined();
    expect(labelCase?.params.expectedText).toBe('SALE 50');
  });

  it('preserves expectedText for edit-text-poster', async () => {
    const cases = await loadEvalCases();
    const posterCase = cases.find((c) => c.id === 'edit-text-poster');

    expect(posterCase).toBeDefined();
    expect(posterCase?.params.expectedText).toBe('CLOSED');
  });

  it('all ocr_text_presence cases have non-empty string expectedText', async () => {
    const cases = await loadEvalCases();
    const ocrCases = cases.filter((c) => c.scorers.includes('ocr_text_presence'));

    for (const evalCase of ocrCases) {
      expect(typeof evalCase.params.expectedText).toBe('string');
      expect((evalCase.params.expectedText as string).trim()).not.toBe('');
    }
  });

  it('no loaded case contains unsupported scorer ids', async () => {
    const supportedScorers = new Set([
      'alpha_coverage',
      'pixel_delta',
      'ocr_text_presence',
      'dimensions_exact',
      'palette_exact',
    ]);
    const cases = await loadEvalCases();

    for (const evalCase of cases) {
      for (const scorer of evalCase.scorers) {
        expect(supportedScorers.has(scorer)).toBe(true);
      }
    }
  });
});
