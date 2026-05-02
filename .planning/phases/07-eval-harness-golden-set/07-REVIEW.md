---
phase: 07-eval-harness-golden-set
reviewed: 2026-05-02T21:04:05Z
depth: standard
files_reviewed: 35
files_reviewed_list:
  - .gitignore
  - eval/cases/edit-prompt.json
  - eval/cases/extract-subject.json
  - eval/fixtures/low-contrast-shape.png
  - eval/fixtures/manifest.json
  - eval/fixtures/multi-object.png
  - eval/fixtures/person-hair-edge.png
  - eval/fixtures/person-silhouette.png
  - eval/fixtures/product-low-contrast.png
  - eval/fixtures/product-simple.png
  - eval/fixtures/small-icon.png
  - eval/fixtures/text-label.png
  - eval/fixtures/text-poster.png
  - eval/fixtures/transparent-edge.png
  - package.json
  - scripts/run-eval.ts
  - src/capabilities/registry.ts
  - src/capabilities/types.ts
  - src/eval/apply-results.ts
  - src/eval/cases.ts
  - src/eval/fixtures.ts
  - src/eval/index.ts
  - src/eval/results.ts
  - src/eval/run.ts
  - src/eval/scorers.ts
  - src/eval/types.ts
  - tests/capabilities/registry-quality.test.ts
  - tests/eval/apply-results.test.ts
  - tests/eval/fixtures.test.ts
  - tests/eval/phase7.acceptance.test.ts
  - tests/eval/results.test.ts
  - tests/eval/run-quality.test.ts
  - tests/eval/run.test.ts
  - tests/eval/scorers.test.ts
  - tests/integration/image_op.runs.test.ts
  - tests/integration/image_op.trace.test.ts
findings:
  critical: 2
  warning: 2
  info: 0
  total: 4
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-05-02T21:04:05Z
**Depth:** standard
**Files Reviewed:** 35
**Status:** issues_found

## Summary

Reviewed the eval harness, golden fixture catalog, capability quality registry changes, runner script, and associated tests. No repo-local `AGENTS.md` or `.codex/skills` / `.agents/skills` project skill instructions were present. The main risks are correctness issues in the quality scores the harness produces and durability issues in stored run artifacts.

## Critical Issues

### CR-01: `alpha_coverage` Scores Only Semi-Transparent Pixels

**File:** `src/eval/scorers.ts:27`
**Issue:** `scoreAlphaCoverage` increments `partialAlphaPixels` only when `alpha > 0 && alpha < 255`, then divides by total pixels. That means a successful hard-mask extraction with opaque foreground pixels and transparent background scores `0`, the same as a fully transparent or otherwise useless output. This corrupts `alpha_coverage` quality data and can promote/demote providers based on the wrong signal.
**Fix:**
```ts
let coveredAlphaPixels = 0;

for (let index = channels - 1; index < data.length; index += channels) {
  if (data[index] > 0) {
    coveredAlphaPixels += 1;
  }
}

return {
  scorer: 'alpha_coverage',
  status: 'scored',
  value: clamp01(coveredAlphaPixels / totalPixels),
};
```
If edge softness is also needed, add a separate scorer such as `partial_alpha_coverage` instead of overloading `alpha_coverage`.

### CR-02: Eval Artifacts Are Overwritten Across Runs

**File:** `src/eval/run.ts:11`
**Issue:** All runs write artifacts into the fixed directory `eval/results/artifacts`, and each case writes to a fixed `${caseId}.png` path at line 78. Every later eval run overwrites the artifacts referenced by earlier result JSON files, and concurrent runs can race on the same output files. The persisted `outputPath` values in historical results therefore stop pointing at the image that was actually scored.
**Fix:**
```ts
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const artifactsDir = path.join(EVAL_RESULTS_DIR, 'artifacts', runId);
await fs.mkdir(artifactsDir, { recursive: true });

// inside the case loop
outputPath = path.join(artifactsDir, `${evalCase.id}.png`);
```
Alternatively create the result filename first and derive the artifact directory from that basename so one result JSON owns one immutable artifact directory.

## Warnings

### WR-01: Runtime Case Validation Accepts Unsupported Ops And Scorers

**File:** `src/eval/cases.ts:11`
**Issue:** `isEvalCase` only checks that `op` and every scorer are strings, but the parsed JSON is cast to `EvalCase`. A typo such as `"pixel-delta"` passes loading and then fails later after capability lookup or invocation. This makes case-file mistakes surface late and can waste paid provider calls before the bad scorer is discovered.
**Fix:** Validate against explicit allowed sets during load:
```ts
const OPS = new Set<CapabilityOp>(['extract_subject', 'edit_prompt', 'composite_layers', 'transform', 'enhance_upscale', 'analyze_dimensions', 'analyze_palette', 'analyze_ocr', 'generate']);
const SCORERS = new Set<EvalScorerId>(['alpha_coverage', 'pixel_delta', 'ocr_text_presence']);

typeof evalCase.op === 'string' &&
OPS.has(evalCase.op as CapabilityOp) &&
Array.isArray(evalCase.scorers) &&
evalCase.scorers.every((scorer) => SCORERS.has(scorer as EvalScorerId))
```

### WR-02: Text Edit Cases Do Not Provide Expected OCR Text

**File:** `eval/cases/edit-prompt.json:19`
**Issue:** The text-edit cases request `ocr_text_presence`, and `runEval` passes `params.expectedText` into the OCR scorer, but these cases only encode the target text inside the natural-language prompt. Once OCR scoring is implemented, these cases will score without a machine-readable expected string and can silently skip or mis-score the intended text assertions.
**Fix:** Add explicit expected text to each OCR-backed case:
```json
"params": {
  "input": "${fixture.path}",
  "prompt": "Change the label text from SALE 25 to SALE 50 while keeping the label style.",
  "expectedText": "SALE 50"
}
```
Do the same for the poster case with `"expectedText": "CLOSED"`, and add a test that `loadEvalCases()` preserves `expectedText`.

---

_Reviewed: 2026-05-02T21:04:05Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
