import type { CapabilityOp } from '../capabilities/types.js';
import type { CapabilityRegistry } from '../capabilities/registry.js';
import type { EvalRunResult } from './types.js';

export function scoresFromEvalResult(
  result: EvalRunResult,
  op: CapabilityOp,
  provider: string,
  modelVersion: string,
): Record<string, number> | undefined {
  const totals = new Map<string, { total: number; count: number }>();

  for (const entry of result.results) {
    if (
      entry.op !== op ||
      entry.provider !== provider ||
      entry.modelVersion !== modelVersion ||
      entry.status !== 'scored'
    ) {
      continue;
    }

    for (const score of entry.scores) {
      if (
        score.status !== 'scored' ||
        typeof score.value !== 'number' ||
        !Number.isFinite(score.value)
      ) {
        continue;
      }

      const aggregate = totals.get(score.scorer) ?? { total: 0, count: 0 };
      aggregate.total += score.value;
      aggregate.count += 1;
      totals.set(score.scorer, aggregate);
    }
  }

  if (totals.size === 0) {
    return undefined;
  }

  return Object.fromEntries(
    Array.from(totals.entries()).map(([scorer, aggregate]) => [
      scorer,
      aggregate.total / aggregate.count,
    ])
  );
}

export function applyEvalResultsToRegistry(
  registry: CapabilityRegistry,
  result: EvalRunResult,
  resultPath?: string,
): void {
  for (const capability of registry.list()) {
    const scores = scoresFromEvalResult(
      result,
      capability.op,
      capability.provider,
      capability.modelVersion
    );

    if (!scores) {
      continue;
    }

    registry.register({
      ...capability,
      quality: {
        ...capability.quality,
        scores,
        evaluatedAt: result.generatedAt,
        evalResultPath: resultPath,
      },
    });
  }
}
