import { describe, expect, it } from 'vitest';
import {
  checkBudgetGate,
  TEMPLATE_ONLY_BUDGET_USD_THRESHOLD,
} from '../../src/task/budget-gate.js';

describe('checkBudgetGate', () => {
  it('rejects sub-threshold budgets without a template match', () => {
    expect(checkBudgetGate({
      constraints: { budget_cap_usd: 0.005 },
      templateMatched: false,
    })).toMatchObject({
      ok: false,
      error: {
        code: 'BUDGET_CAP_REQUIRES_TEMPLATE',
        budget_cap_usd: 0.005,
        threshold_usd: 0.01,
      },
    });
  });

  it('allows sub-threshold budgets when a template matched', () => {
    expect(checkBudgetGate({
      constraints: { budget_cap_usd: 0.005 },
      templateMatched: true,
    })).toEqual({ ok: true });
  });

  it('allows budgets above the template-only threshold', () => {
    expect(checkBudgetGate({
      constraints: { budget_cap_usd: 0.05 },
      templateMatched: false,
    })).toEqual({ ok: true });
  });

  it('allows requests without a budget cap', () => {
    expect(checkBudgetGate({
      constraints: undefined,
      templateMatched: false,
    })).toEqual({ ok: true });
  });

  it('allows the exact threshold boundary', () => {
    expect(checkBudgetGate({
      constraints: { budget_cap_usd: 0.01 },
      templateMatched: false,
    })).toEqual({ ok: true });
  });

  it('exports the named template-only threshold', () => {
    expect(TEMPLATE_ONLY_BUDGET_USD_THRESHOLD).toBe(0.01);
  });
});
