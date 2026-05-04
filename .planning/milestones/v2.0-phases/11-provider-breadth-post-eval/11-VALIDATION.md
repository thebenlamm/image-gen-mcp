---
phase: 11-provider-breadth-post-eval
slug: provider-breadth-post-eval
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-04
updated: 2026-05-04
---

# Phase 11 - Validation Strategy

Per-phase validation contract for Nyquist coverage after execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.9 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- tests/capabilities/photoroom-extract-subject.test.ts tests/capabilities/photoroom-composite-layers.test.ts tests/capabilities/fal-edit-prompt.test.ts tests/capabilities/ideogram-generate.test.ts tests/eval/run.test.ts tests/eval/apply-results.test.ts tests/task/dag-executor.test.ts` |
| Full suite command | `npm test` |
| Build command | `npm run build` |
| Live eval command | `npm run eval` with `PHOTOROOM_API_KEY`, `FAL_KEY`, and `IDEOGRAM_API_KEY` set |

## Requirement-to-Task Map

| Requirement | Task Surface | Automated/UAT Coverage | Status |
|-------------|--------------|------------------------|--------|
| PROV-01: Photoroom product route | `src/capabilities/photoroom-extract-subject.ts`, `src/capabilities/photoroom-composite-layers.ts` | `tests/capabilities/photoroom-*.test.ts`, `11-HUMAN-UAT.md` | COVERED |
| PROV-02: fal faster/cheaper mirror route | `src/capabilities/fal-edit-prompt.ts`, `eval/cases/fal-flux-kontext.json` | `tests/capabilities/fal-edit-prompt.test.ts`, `11-HUMAN-UAT.md` | COVERED |
| PROV-03: Flux Kontext `edit_prompt` | `src/capabilities/fal-edit-prompt.ts`, `src/capabilities/register.ts` | `tests/capabilities/fal-edit-prompt.test.ts`, `tests/eval/apply-results.test.ts` | COVERED |
| PROV-04: Ideogram `generate` text fidelity | `src/capabilities/ideogram-generate.ts`, `eval/cases/ideogram.json` | `tests/capabilities/ideogram-generate.test.ts`, `11-HUMAN-UAT.md` | COVERED |
| PROV-05: each provider has valid eval before scores | `src/eval/run.ts`, `src/eval/apply-results.ts`, `eval/cases/*.json` | `tests/eval/run.test.ts`, `tests/eval/apply-results.test.ts`, `npm run eval` UAT | COVERED |

## Cross-Reference Audit

Phase 11 verification passed after gap closure, live evals, and live route UAT. The follow-up warnings from `11-REVIEW.md` are now covered by provider timeout, Photoroom `canvas.background`, malformed layer validation, and terminal manifest regressions.

## Validation Audit 2026-05-04

| Metric | Count |
|--------|-------|
| Requirements audited | 5 |
| Gaps found | 0 |
| Resolved by new tests | 0 |
| Existing automated/UAT coverage | 5 |
| Escalated | 0 |

## Verification Results

| Command | Result |
|---------|--------|
| Targeted Phase 11 debt suite | PASS |
| `npm run eval` | PASS; latest user-confirmed run wrote `eval/results/2026-05-04T01-49-41-210Z.json` and later UAT wrote `eval/results/2026-05-04T02-48-34-346Z.json` |
| `npm run build` | PASS |

## Validation Sign-Off

- [x] All provider-breadth requirements have automated coverage and live UAT where external providers are required.
- [x] Review warnings affecting provider robustness are closed.
- [x] `nyquist_compliant: true` set in frontmatter.

Approval: approved 2026-05-04
