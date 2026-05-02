import * as fs from 'fs/promises';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { CapabilityRegistry } from '../../src/capabilities/registry.js';
import type { Capability } from '../../src/capabilities/types.js';
import { loadEvalCases } from '../../src/eval/cases.js';
import { loadFixtures } from '../../src/eval/fixtures.js';

const UNSCORED_ERROR =
  'Capability extract_subject/provider-b is unscored; add an eval case before production routing';

function capability(
  provider: string,
  options: {
    modelVersion?: string;
    scores?: Record<string, number>;
  } = {},
): Capability {
  return {
    op: 'extract_subject',
    provider,
    modelVersion: options.modelVersion ?? 'model-v1',
    constraints: { outputFormat: 'png' },
    cost: { perCallUsd: 0 },
    quality: options.scores ? { scores: options.scores } : undefined,
    invoke: async () => ({ buffer: Buffer.alloc(0), model: 'fake-model' }),
  };
}

describe('Phase 7 acceptance: eval harness routing preconditions', () => {
  it('EVAL-01 fixture manifest contains exactly 10 fixtures across required categories', async () => {
    const fixtures = await loadFixtures();

    expect(fixtures).toHaveLength(10);
    expect(new Set(fixtures.map((fixture) => fixture.category))).toEqual(new Set([
      'product',
      'person',
      'text-heavy',
      'transparent-edge',
      'low-contrast',
    ]));
  });

  it('EVAL-02 eval cases cover extract_subject/@imgly/local and edit_prompt/openai', async () => {
    const cases = await loadEvalCases();

    expect(cases.some((evalCase) =>
      evalCase.op === 'extract_subject' &&
      evalCase.provider === '@imgly/local'
    )).toBe(true);
    expect(cases.some((evalCase) =>
      evalCase.op === 'edit_prompt' &&
      evalCase.provider === 'openai'
    )).toBe(true);
  });

  it('EVAL-03 programmatic scorers are implemented without OCR placeholder', async () => {
    const scorersSource = await fs.readFile(
      path.resolve('src/eval/scorers.ts'),
      'utf8',
    );
    const editCasesSource = await fs.readFile(
      path.resolve('eval/cases/edit-prompt.json'),
      'utf8',
    );
    const casesLoaderSource = await fs.readFile(
      path.resolve('src/eval/cases.ts'),
      'utf8',
    );

    expect(scorersSource).not.toContain('ocr dependency unavailable');
    expect(editCasesSource).toContain('"expectedText": "SALE 50"');
    expect(editCasesSource).toContain('"expectedText": "CLOSED"');
    expect(casesLoaderSource).toContain('ocr_text_presence but is missing params.expectedText');
  });

  it('EVAL-05 blocks unscored second providers and lists scored providers for routing', () => {
    const registry = new CapabilityRegistry();

    registry.register(capability('provider-a'));
    expect(() => registry.register(capability('provider-b'))).toThrow(UNSCORED_ERROR);

    registry.register(capability('provider-b', { scores: { alpha_coverage: 0.8 } }));

    expect(registry.listScored('extract_subject').map((entry) => entry.provider)).toEqual([
      'provider-b',
    ]);
  });

  it('EVAL-05 invalidates quality on model changes and requires explicit unscored override', () => {
    const registry = new CapabilityRegistry();
    registry.register(capability('provider-a'));
    registry.register(capability('provider-b', { scores: { alpha_coverage: 0.8 } }));

    expect(() =>
      registry.register(capability('provider-b', {
        modelVersion: 'model-v2',
        scores: { alpha_coverage: 0.9 },
      })),
    ).toThrow(UNSCORED_ERROR);

    registry.register(capability('provider-b', {
      modelVersion: 'model-v2',
      scores: { alpha_coverage: 0.9 },
    }), { allowUnscoredProduction: true });

    expect(registry.get('extract_subject', 'provider-b')?.quality).toBeUndefined();
  });
});
