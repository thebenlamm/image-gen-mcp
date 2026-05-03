import { describe, expect, it } from 'vitest';
import { CapabilityRegistry } from '../../src/capabilities/registry.js';
import type { Capability, CapabilityOp } from '../../src/capabilities/types.js';
import {
  applyEvalResultsToRegistry,
  scoresFromEvalResult,
} from '../../src/eval/apply-results.js';
import type { EvalRunResult } from '../../src/eval/types.js';

function capability(
  provider = '@imgly/local',
  modelVersion = 'model-v1',
  op: CapabilityOp = 'extract_subject',
  unscoredJustification?: string,
): Capability {
  return {
    op,
    provider,
    modelVersion,
    constraints: { outputFormat: 'png' },
    cost: { perCallUsd: 0 },
    quality: unscoredJustification ? { unscoredJustification } : undefined,
    invoke: async () => ({ kind: 'image' as const, buffer: Buffer.alloc(0), model: 'fake-model' }),
  };
}

function result(overrides: Partial<EvalRunResult> = {}): EvalRunResult {
  return {
    schemaVersion: 1,
    generatedAt: '2026-05-02T20:00:00Z',
    results: [
      {
        caseId: 'case-1',
        op: 'extract_subject',
        provider: '@imgly/local',
        modelVersion: 'model-v1',
        fixtureId: 'fixture-1',
        status: 'scored',
        scores: [{ scorer: 'alpha_coverage', status: 'scored', value: 0.2 }],
      },
      {
        caseId: 'case-2',
        op: 'extract_subject',
        provider: '@imgly/local',
        modelVersion: 'model-v1',
        fixtureId: 'fixture-2',
        status: 'scored',
        scores: [
          { scorer: 'alpha_coverage', status: 'scored', value: 0.6 },
          { scorer: 'ocr_text_presence', status: 'skipped' },
        ],
      },
    ],
    ...overrides,
  };
}

describe('apply eval results to capability registry quality', () => {
  it('aggregates scored entries by scorer id using arithmetic mean', () => {
    expect(scoresFromEvalResult(result(), 'extract_subject', '@imgly/local', 'model-v1')).toEqual({
      alpha_coverage: 0.4,
    });
  });

  it('does not create scores from skipped or errored cases', () => {
    const noScores = result({
      results: [
        {
          caseId: 'case-skipped',
          op: 'extract_subject',
          provider: '@imgly/local',
          modelVersion: 'model-v1',
          fixtureId: 'fixture-1',
          status: 'skipped',
          scores: [{ scorer: 'alpha_coverage', status: 'scored', value: 1 }],
        },
        {
          caseId: 'case-error',
          op: 'extract_subject',
          provider: '@imgly/local',
          modelVersion: 'model-v1',
          fixtureId: 'fixture-2',
          status: 'error',
          scores: [{ scorer: 'alpha_coverage', status: 'scored', value: 1 }],
        },
      ],
    });

    expect(scoresFromEvalResult(noScores, 'extract_subject', '@imgly/local', 'model-v1'))
      .toBeUndefined();
  });

  it('does not modify registry quality for mismatched model versions', () => {
    const registry = new CapabilityRegistry();
    registry.register(capability('@imgly/local', 'model-v2'));

    applyEvalResultsToRegistry(registry, result(), 'eval/results/run.json');

    expect(registry.get('extract_subject', '@imgly/local')?.quality).toBeUndefined();
  });

  it('sets quality scores and provenance on matching registered capabilities', () => {
    const registry = new CapabilityRegistry();
    registry.register(capability());

    applyEvalResultsToRegistry(registry, result(), 'eval/results/run.json');

    expect(registry.get('extract_subject', '@imgly/local')?.quality).toEqual({
      scores: { alpha_coverage: 0.4 },
      evaluatedAt: '2026-05-02T20:00:00Z',
      evalResultPath: 'eval/results/run.json',
    });
  });

  it('populates quality scores for Phase 11 provider breadth capabilities', () => {
    const registry = new CapabilityRegistry();
    registry.register(capability('@imgly/local', 'local-bg-v1', 'extract_subject'));
    registry.register(capability(
      'photoroom',
      'photoroom-remove-bg-v2',
      'extract_subject',
      'test-only Phase 11 extract_subject second provider',
    ), {
      allowUnscoredProduction: true,
    });
    registry.register(capability('sharp', 'sharp-composite-v1', 'composite_layers'));
    registry.register(capability(
      'photoroom',
      'photoroom-image-editing-v1',
      'composite_layers',
      'test-only Phase 11 composite_layers second provider',
    ), {
      allowUnscoredProduction: true,
    });
    registry.register(capability('openai', 'gpt-image-1.5', 'edit_prompt'));
    registry.register(capability(
      'fal',
      'fal-ai/flux-pro/kontext',
      'edit_prompt',
      'test-only Phase 11 edit_prompt second provider',
    ), {
      allowUnscoredProduction: true,
    });
    registry.register(capability('ideogram', 'ideogram-v3-0', 'generate'));

    applyEvalResultsToRegistry(registry, {
      schemaVersion: 1,
      generatedAt: '2026-05-03T21:00:00Z',
      results: [
        {
          caseId: 'extract-photoroom-product-simple',
          op: 'extract_subject',
          provider: 'photoroom',
          modelVersion: 'photoroom-remove-bg-v2',
          fixtureId: 'product-simple',
          status: 'scored',
          scores: [
            { scorer: 'alpha_coverage', status: 'scored', value: 0.88 },
            { scorer: 'pixel_delta', status: 'scored', value: 0.12 },
          ],
        },
        {
          caseId: 'composite-photoroom-product-with-shadow',
          op: 'composite_layers',
          provider: 'photoroom',
          modelVersion: 'photoroom-image-editing-v1',
          fixtureId: 'composite-bg',
          status: 'scored',
          scores: [{ scorer: 'alpha_coverage', status: 'scored', value: 0.95 }],
        },
        {
          caseId: 'edit-fal-kontext-text-label',
          op: 'edit_prompt',
          provider: 'fal',
          modelVersion: 'fal-ai/flux-pro/kontext',
          fixtureId: 'text-label',
          status: 'scored',
          scores: [
            { scorer: 'pixel_delta', status: 'scored', value: 0.24 },
            { scorer: 'ocr_text_presence', status: 'scored', value: 1 },
          ],
        },
        {
          caseId: 'generate-ideogram-text-fresh-roast',
          op: 'generate',
          provider: 'ideogram',
          modelVersion: 'ideogram-v3-0',
          fixtureId: 'text-label',
          status: 'scored',
          scores: [{ scorer: 'ocr_text_presence', status: 'scored', value: 1 }],
        },
      ],
    }, 'eval/results/phase11.json');

    expect(registry.get('extract_subject', 'photoroom')?.quality?.scores).toEqual({
      alpha_coverage: 0.88,
      pixel_delta: 0.12,
    });
    expect(registry.get('composite_layers', 'photoroom')?.quality?.scores).toEqual({
      alpha_coverage: 0.95,
    });
    expect(registry.get('edit_prompt', 'fal')?.quality?.scores).toEqual({
      pixel_delta: 0.24,
      ocr_text_presence: 1,
    });
    expect(registry.get('generate', 'ideogram')?.quality?.scores).toEqual({
      ocr_text_presence: 1,
    });
    expect(registry.listScored('composite_layers').map((cap) => cap.provider)).toContain('photoroom');
  });
});
