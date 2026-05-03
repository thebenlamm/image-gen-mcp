import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  AnalyzeDimensionsResult,
  AnalyzeOcrResult,
  AnalyzePaletteResult,
} from '../capabilities/types.js';
import { capabilityRegistry } from '../capabilities/registry.js';
import { writeFileAtomic } from '../runs/write.js';
import { loadEvalCases } from './cases.js';
import { applyEvalResultsToRegistry } from './apply-results.js';
import { EVAL_RESULTS_DIR, writeEvalResults } from './results.js';
import { runScorers } from './scorers.js';
import type { EvalCase, EvalCaseResult, EvalRunResult } from './types.js';

const ARTIFACTS_DIR = path.join(EVAL_RESULTS_DIR, 'artifacts');

export function hasUsableEnv(name: string): boolean {
  const value = process.env[name]?.trim();
  return Boolean(value && !/^\$\{[^}]+\}$/.test(value));
}

function missingRequiredEnv(evalCase: EvalCase): string[] {
  return (evalCase.requiredEnv ?? []).filter((name) => !hasUsableEnv(name));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getInputPath(evalCase: EvalCase): string {
  const input = evalCase.params.input;
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error(`eval case ${evalCase.id} requires params.input`);
  }
  return input;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function scorePassed(
  score: { scorer: string; status: string; value?: number },
  params: Record<string, unknown> = {},
): boolean {
  if (score.status !== 'scored' || typeof score.value !== 'number' || !Number.isFinite(score.value)) {
    return false;
  }
  if (score.scorer === 'pixel_delta') {
    const min = optionalNumber(params.minPixelDelta);
    const max = optionalNumber(params.maxPixelDelta);
    return (min === undefined || score.value >= min) && (max === undefined || score.value <= max);
  }
  if (
    score.scorer === 'dimensions_exact' ||
    score.scorer === 'palette_exact' ||
    score.scorer === 'ocr_text_presence'
  ) {
    return score.value >= 1;
  }
  return true;
}

export async function runEval(): Promise<string> {
  const cases = await loadEvalCases();
  const results: EvalCaseResult[] = [];

  await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

  for (const evalCase of cases) {
    const missingEnv = missingRequiredEnv(evalCase);
    if (missingEnv.length > 0) {
      results.push({
        caseId: evalCase.id,
        op: evalCase.op,
        provider: evalCase.provider,
        fixtureId: evalCase.fixtureId,
        status: 'skipped',
        scores: [],
        error: `missing required env: ${missingEnv.join(', ')}`,
      });
      continue;
    }

    const capability = capabilityRegistry.get(evalCase.op, evalCase.provider);
    if (!capability) {
      results.push({
        caseId: evalCase.id,
        op: evalCase.op,
        provider: evalCase.provider,
        fixtureId: evalCase.fixtureId,
        status: 'error',
        scores: [],
        error: `capability not registered: ${evalCase.op}/${evalCase.provider}`,
      });
      continue;
    }

    const startedAt = Date.now();
    let outputPath: string | undefined;
    let resultData: AnalyzeDimensionsResult | AnalyzePaletteResult | AnalyzeOcrResult | undefined;
    try {
      const inputPath = getInputPath(evalCase);
      outputPath = path.join(ARTIFACTS_DIR, `${evalCase.id}.png`);
      const invokeResult = await capability.invoke({
        params: evalCase.params,
        outputPath,
      });

      if (invokeResult.kind === 'image') {
        await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
        await writeFileAtomic(outputPath, invokeResult.buffer);
      } else {
        resultData = invokeResult.data;
        outputPath = undefined;
      }

      const scores = await runScorers(
        inputPath,
        outputPath,
        evalCase.scorers,
        evalCase.params,
        resultData,
      );
      const status = scores.length > 0 && scores.every((score) => scorePassed(score, evalCase.params))
        ? 'scored'
        : 'error';

      results.push({
        caseId: evalCase.id,
        op: evalCase.op,
        provider: evalCase.provider,
        modelVersion: capability.modelVersion,
        fixtureId: evalCase.fixtureId,
        status,
        outputPath,
        scores,
        error: status === 'error'
          ? `eval scorer failed: ${scores
            .filter((score) => !scorePassed(score, evalCase.params))
            .map((score) => `${score.scorer}${score.reason ? ` (${score.reason})` : ''}`)
            .join(', ')}`
          : undefined,
        latencyMs: Date.now() - startedAt,
      });
    } catch (error) {
      results.push({
        caseId: evalCase.id,
        op: evalCase.op,
        provider: evalCase.provider,
        modelVersion: capability.modelVersion,
        fixtureId: evalCase.fixtureId,
        status: 'error',
        outputPath,
        scores: [],
        error: getErrorMessage(error),
        latencyMs: Date.now() - startedAt,
      });
    }
  }

  const hasScoredCase = results.some((result) =>
    result.scores.some((score) => score.status === 'scored')
  );
  if (!hasScoredCase) {
    throw new Error('eval completed without scored cases');
  }

  const runResult: EvalRunResult = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    results,
  };

  const resultPath = await writeEvalResults(runResult);
  const failed = results.filter((result) => result.status === 'error');
  if (failed.length > 0) {
    throw new Error(`eval failed ${failed.length} case(s); see result JSON: ${resultPath}`);
  }

  applyEvalResultsToRegistry(capabilityRegistry, runResult, resultPath);
  return resultPath;
}
