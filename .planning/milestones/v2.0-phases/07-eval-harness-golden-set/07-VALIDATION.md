---
phase: 07-eval-harness-golden-set
slug: eval-harness-golden-set
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-04
updated: 2026-05-04
---

# Phase 07 - Validation Strategy

Per-phase validation contract for Nyquist coverage after execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.9 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- tests/eval tests/capabilities/registry-quality.test.ts` |
| Full suite command | `npm test` |
| Build command | `npm run build` |
| Eval command | `npm run eval` |

## Requirement-to-Task Map

| Requirement | Task Surface | Automated Coverage | Status |
|-------------|--------------|--------------------|--------|
| EVAL-01: 10 golden fixtures across required categories | `eval/fixtures/`, `src/eval/fixtures.ts` | `tests/eval/fixtures.test.ts` | COVERED |
| EVAL-02: Per-capability eval cases | `eval/cases/*.json`, `src/eval/cases.ts` | `tests/eval/cases.test.ts` | COVERED |
| EVAL-03: Pixel, alpha, and OCR scorers | `src/eval/scorers.ts` | `tests/eval/scorers.test.ts`, `tests/eval/phase7.acceptance.test.ts` | COVERED |
| EVAL-04: Eval results populate `quality.scores` | `src/eval/apply-results.ts`, `src/eval/run.ts` | `tests/eval/apply-results.test.ts`, `tests/eval/run-quality.test.ts` | COVERED |
| EVAL-05: Unscored second providers are blocked | `src/capabilities/registry.ts` | `tests/capabilities/registry-quality.test.ts`, `tests/eval/phase7.acceptance.test.ts` | COVERED |

## Cross-Reference Audit

Phase 7 verification passed after gap closure. The alpha hard-mask scorer, real tesseract OCR scorer, and machine-readable `expectedText` gates are all covered by focused tests.

## Validation Audit 2026-05-04

| Metric | Count |
|--------|-------|
| Requirements audited | 5 |
| Gaps found | 0 |
| Resolved by new tests | 0 |
| Existing automated coverage | 5 |
| Escalated | 0 |

## Verification Results

| Command | Result |
|---------|--------|
| `npm run eval` | PASS in live Phase 11 UAT after provider keys were configured |
| `npm run build` | PASS |

## Validation Sign-Off

- [x] All eval requirements have targeted automated coverage.
- [x] Provider-backed eval behavior has live UAT coverage where credentials are required.
- [x] `nyquist_compliant: true` set in frontmatter.

Approval: approved 2026-05-04
