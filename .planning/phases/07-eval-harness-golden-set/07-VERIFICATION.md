---
phase: 07-eval-harness-golden-set
verified: 2026-05-02T21:07:54Z
status: gaps_found
score: 4/5 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Programmatic scorers (pixelmatch DeltaE for edits, alpha coverage for extract, OCR round-trip for text-bearing edits) run without manual intervention"
    status: failed
    reason: "The OCR scorer always returns skipped, so OCR round-trip scoring does not run. The alpha_coverage scorer counts only semi-transparent pixels, not all alpha-covered foreground pixels, so extract quality scores can be wrong for valid hard-mask outputs."
    artifacts:
      - path: "src/eval/scorers.ts"
        issue: "scoreOcrTextPresence returns status skipped with reason 'ocr dependency unavailable'; scoreAlphaCoverage counts alpha > 0 && alpha < 255 instead of alpha > 0."
      - path: "eval/cases/edit-prompt.json"
        issue: "Text-bearing edit cases request OCR scoring but do not provide machine-readable expectedText for the future OCR assertion."
    missing:
      - "Implement actual OCR text-presence/round-trip scoring or add an accepted override/deferred contract tied to Phase 8."
      - "Fix alpha_coverage to measure alpha-covered pixels, with a separate scorer if partial-alpha edge softness is desired."
      - "Add expectedText values for OCR-backed edit cases."
---

# Phase 7: Eval Harness + Golden Set Verification Report

**Phase Goal:** `npm run eval` produces measured quality scores for every registered capability, populating the registry so future planner routing is evidence-based  
**Verified:** 2026-05-02T21:07:54Z  
**Status:** gaps_found  
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `eval/fixtures/` contains 10 input images covering product, person, text-heavy, transparent-edge, and low-contrast | VERIFIED | `eval/fixtures/manifest.json` has exactly 10 entries and `find eval/fixtures -name '*.png'` returned 10 PNGs. `loadFixtures()` enforces all five categories. |
| 2 | `npm run eval` exits 0 and writes `eval/results/<date>.json` with scored entries for Phase 5 capabilities | VERIFIED | `OPENAI_API_KEY='${OPENAI_API_KEY}' npm run eval` exited 0 and wrote `eval/results/2026-05-02T21-07-27-289Z.json`; result had 5 scored `extract_subject` entries and 3 env-skipped `edit_prompt` entries. Provider-backed edit scoring is implemented behind `OPENAI_API_KEY`, but was not externally exercised in this verification. |
| 3 | Eval results populate `quality.scores` on matching registered capabilities and leave unmatched capabilities unscored | VERIFIED | `runEval()` calls `applyEvalResultsToRegistry()` after JSON persistence. `scoresFromEvalResult()` filters by op/provider/model/status and aggregates finite scored values. `tests/eval/run-quality.test.ts` verifies matching quality is populated while unmatched capability scores remain undefined. |
| 4 | A second provider for an existing op without an eval case/score is blocked for production routing | VERIFIED | `CapabilityRegistry.register()` throws `Capability ... is unscored; add an eval case before production routing` for unscored second providers unless `allowUnscoredProduction` is explicit. Covered by `tests/capabilities/registry-quality.test.ts` and `tests/eval/phase7.acceptance.test.ts`. |
| 5 | Programmatic scorers run without manual intervention: pixel delta, alpha coverage, OCR round-trip | FAILED | `scorePixelDelta()` runs, but `scoreOcrTextPresence()` always returns skipped, and `scoreAlphaCoverage()` measures only partial-alpha pixels. Code review CR-01 is blocking for quality correctness; WR-02 reinforces that OCR-backed cases lack `expectedText`. |

**Score:** 4/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `eval/fixtures/manifest.json` | Golden fixture catalog | VERIFIED | Exists, substantive, 10 entries across required categories. |
| `eval/cases/extract-subject.json` | Extract-subject cases | VERIFIED | 5 `extract_subject/@imgly/local` cases with `alpha_coverage`. |
| `eval/cases/edit-prompt.json` | Edit-prompt cases | WARNING | 3 `edit_prompt/openai` cases exist with `pixel_delta` and OCR on text-heavy cases, but OCR cases lack explicit `expectedText`. |
| `src/eval/run.ts` | Eval runner | VERIFIED | Loads cases, invokes registry capabilities, scores outputs, writes results, applies scores. Review CR-02 about artifact overwrite is real but does not block the Phase 7 core goal. |
| `src/eval/scorers.ts` | Programmatic scorers | FAILED | Pixel delta exists; OCR is skipped; alpha coverage is semantically wrong for opaque foregrounds. |
| `src/eval/apply-results.ts` | Apply scores to registry | VERIFIED | Aggregates finite scored values by scorer id and preserves provenance. |
| `src/capabilities/registry.ts` | Quality guardrails and scored listing | VERIFIED | Implements model-version invalidation, unscored second-provider guard, and `listScored()`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `scripts/run-eval.ts` | eval runner | `registerBuiltInCapabilities(); await runEval()` | WIRED | `npm run eval` invokes the harness through the package script. |
| `src/eval/run.ts` | `CapabilityRegistry` | `capabilityRegistry.get(evalCase.op, evalCase.provider)` | WIRED | Cases invoke actual registered capabilities when env requirements are met. |
| `src/eval/run.ts` | scorers | `runScorers(inputPath, outputPath, evalCase.scorers, expectedText)` | PARTIAL | Scorer dispatch is wired, but OCR dispatch reaches a skipped placeholder. |
| `src/eval/run.ts` | registry quality | `applyEvalResultsToRegistry(capabilityRegistry, runResult, resultPath)` | WIRED | Result JSON is applied back to in-process registry quality. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `src/eval/run.ts` | `results` | `loadEvalCases()` + `capability.invoke()` + `runScorers()` | Yes for local extract cases; provider cases require env | FLOWING |
| `src/eval/apply-results.ts` | `quality.scores` | scored `EvalRunResult.results` entries | Yes for scored entries only | FLOWING |
| `src/eval/scorers.ts` | `ocr_text_presence` | placeholder return | No | HOLLOW |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Focused Phase 7 tests | `npm test -- tests/eval tests/capabilities/registry-quality.test.ts tests/integration/image_op.runs.test.ts tests/integration/image_op.trace.test.ts` | 10 files, 34 tests passed | PASS |
| TypeScript build | `npm run build` | `tsc` exited 0 | PASS |
| Eval command | `OPENAI_API_KEY='${OPENAI_API_KEY}' npm run eval` | Exited 0, wrote `eval/results/2026-05-02T21-07-27-289Z.json`; 5 scored extract cases, 3 skipped edit cases | PASS with caveat |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| EVAL-01 | 07-01 | 10 input images covering required subject types | SATISFIED | Manifest and PNG count verified; `fixtures.test.ts` passes. |
| EVAL-02 | 07-01 | Per-capability test definitions | SATISFIED | `eval/cases/extract-subject.json` and `eval/cases/edit-prompt.json` exist and load. |
| EVAL-03 | 07-01 | `npm run eval` executes cases with pixelmatch, alpha coverage, OCR round-trip and writes JSON | BLOCKED | Command writes JSON and local scores, but OCR round-trip is not implemented and alpha coverage is not a correct coverage metric. |
| EVAL-04 | 07-02 | Eval results populate `quality.scores` | SATISFIED | `apply-results.ts`, `run.ts`, and tests verify score application and unmatched capabilities remain unscored. |
| EVAL-05 | 07-02 | New providers require eval score before production routing | SATISFIED | Registry guard blocks unscored second providers by default; tests verify behavior. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/eval/scorers.ts` | 59 | OCR placeholder always skipped | BLOCKER | Roadmap requires OCR round-trip scoring to run without manual intervention. |
| `src/eval/scorers.ts` | 27 | `alpha_coverage` counts only partial alpha | BLOCKER | Extract quality scores can be materially wrong. |
| `src/eval/run.ts` | 11 | fixed artifact dir and fixed case filenames | WARNING | Review CR-02: historical result JSON outputPath values can be overwritten by later runs; follow-up debt unless immutable eval artifacts become required. |
| `src/eval/cases.ts` | 11 | weak enum validation for ops/scorers | WARNING | Review WR-01: case typos fail late and could waste provider calls. |
| `eval/cases/edit-prompt.json` | 19 | OCR cases encode expected text only in prompt | WARNING | Review WR-02: future OCR scorer lacks machine-readable expected text. |

### Human Verification Required

None required for this status. External OpenAI-backed edit scoring was not exercised with a real key, but automated gaps already block phase acceptance.

### Gaps Summary

Most Phase 7 structure is implemented: fixtures, cases, runner, result JSON, quality score application, and registry guardrails are present and tested. The phase goal is not fully achieved because the score data is not yet trustworthy enough for evidence-based planner routing: OCR scoring is a skipped placeholder and alpha coverage does not measure alpha coverage correctly. The code review's artifact overwrite issue is valid follow-up debt, but it does not by itself prevent the core Phase 7 goal from being achieved.

---

_Verified: 2026-05-02T21:07:54Z_  
_Verifier: the agent (gsd-verifier)_
