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

  it('has unique case ids', async () => {
    const cases = await loadEvalCases();
    const ids = cases.map((evalCase) => evalCase.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('loads Phase 11 provider breadth eval cases', async () => {
    const cases = await loadEvalCases();
    const photoroomCases = cases.filter((c) => c.provider === 'photoroom');
    const falCases = cases.filter((c) => c.provider === 'fal');
    const ideogramCases = cases.filter((c) => c.provider === 'ideogram');

    expect(photoroomCases).toHaveLength(4);
    expect(photoroomCases.filter((c) => c.op === 'extract_subject')).toHaveLength(3);
    expect(photoroomCases.filter((c) => c.op === 'composite_layers')).toHaveLength(1);
    expect(photoroomCases.every((c) => c.requiredEnv?.includes('PHOTOROOM_API_KEY'))).toBe(true);
    expect(falCases).toHaveLength(2);
    expect(falCases.every((c) => c.requiredEnv?.includes('FAL_KEY'))).toBe(true);
    expect(ideogramCases).toHaveLength(2);
    expect(ideogramCases.every((c) => c.op === 'generate')).toBe(true);
    expect(ideogramCases.every((c) => c.requiredEnv?.includes('IDEOGRAM_API_KEY'))).toBe(true);
  });

  it('engages the Photoroom composite shadow eval path', async () => {
    const cases = await loadEvalCases();
    const composite = cases.find((c) => c.id === 'composite-photoroom-product-with-shadow');

    expect(composite?.op).toBe('composite_layers');
    expect(composite?.provider).toBe('photoroom');
    expect(composite?.params.shadow).toEqual({ enabled: true });
    expect(composite?.params.input).toBeUndefined();
    expect(composite?.scorers).toEqual(['alpha_coverage']);
  });
});
