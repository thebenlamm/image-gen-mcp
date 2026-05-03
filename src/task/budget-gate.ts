import type { TaskConstraints } from './planner.js';

/**
 * Below this cap, image_task must use a template and skip the planner LLM.
 * The planner call alone can consume a meaningful share of sub-cent budgets.
 */
export const TEMPLATE_ONLY_BUDGET_USD_THRESHOLD = 0.01;

export type BudgetGateError = {
  code: 'BUDGET_CAP_REQUIRES_TEMPLATE';
  message: string;
  budget_cap_usd: number;
  threshold_usd: number;
  suggestion: string;
};

export type BudgetGateResult =
  | { ok: true }
  | { ok: false; error: BudgetGateError };

export function checkBudgetGate(args: {
  constraints?: TaskConstraints;
  templateMatched: boolean;
}): BudgetGateResult {
  const cap = args.constraints?.budget_cap_usd;
  if (cap === undefined) return { ok: true };
  if (cap >= TEMPLATE_ONLY_BUDGET_USD_THRESHOLD) return { ok: true };
  if (args.templateMatched) return { ok: true };

  return {
    ok: false,
    error: {
      code: 'BUDGET_CAP_REQUIRES_TEMPLATE',
      message: `budget_cap_usd=${cap} is below TEMPLATE_ONLY_BUDGET_USD_THRESHOLD=${TEMPLATE_ONLY_BUDGET_USD_THRESHOLD}; the planner is not allowed for this cap. Provide a goal that matches a known template or raise budget_cap_usd to at least ${TEMPLATE_ONLY_BUDGET_USD_THRESHOLD}.`,
      budget_cap_usd: cap,
      threshold_usd: TEMPLATE_ONLY_BUDGET_USD_THRESHOLD,
      suggestion: `raise budget_cap_usd to >= ${TEMPLATE_ONLY_BUDGET_USD_THRESHOLD} or use a template-matching goal`,
    },
  };
}
