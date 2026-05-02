import { describe, expect, it } from 'vitest';
import { CapabilityRegistry } from '../../src/capabilities/registry.js';
import type { Capability } from '../../src/capabilities/types.js';
import {
  applyEvalResultsToRegistry,
  scoresFromEvalResult,
} from '../../src/eval/apply-results.js';
import type { EvalRunResult } from '../../src/eval/types.js';

function capability(provider = '@imgly/local', modelVersion = 'model-v1'): Capability {
  return {
    op: 'extract_subject',
    provider,
    modelVersion,
    constraints: { outputFormat: 'png' },
    cost: { perCallUsd: 0 },
    invoke: async () => ({ buffer: Buffer.alloc(0), model: 'fake-model' }),
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
});
