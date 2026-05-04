---
phase: 07-eval-harness-golden-set
reviewed: 2026-05-02T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - src/eval/scorers.ts
  - src/eval/cases.ts
  - tests/eval/scorers.test.ts
  - tests/eval/cases.test.ts
  - tests/eval/phase7.acceptance.test.ts
  - eval/cases/edit-prompt.json
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase 07: Code Review Report (Phase 07-03 gap closure)

**Reviewed:** 2026-05-02
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

The Phase 07-03 changes wire tesseract.js OCR scoring into `scoreOcrTextPresence`, replace
the prior alpha-coverage placeholder with an actual foreground-pixel count, and add loader
validation requiring `params.expectedText` whenever `ocr_text_presence` is among the scorers.
The implementation is small and readable, the test coverage matches the new behaviors, and
the acceptance test asserts that the documented placeholder strings are gone.

The most consequential defect is in `scoreOcrTextPresence` itself: when `createWorker('eng')`
throws (network failure pulling traineddata, missing native bindings, sandbox without
`/tmp` write access, etc.), the error escapes the scorer and aborts the entire eval case
in `runEval` instead of producing a per-scorer `status: 'error'` result. That contradicts
the contract used by every other scorer and the catch branch already in the same function.
Several smaller issues — loose type guards in `isEvalCase`, fragile OCR text normalization,
and pre-existing per-call worker creation — are documented as warnings/info.

No security, injection, or secret-handling issues were found. No test was observed to be
flaky or assertion-light beyond the noted item about `alpha_coverage` accepting
`> 0` instead of an exact value in the partial-alpha test.

## Warnings

### WR-01: Worker-creation failure escapes `scoreOcrTextPresence` instead of returning `status: 'error'`

**File:** `src/eval/scorers.ts:64-103`
**Issue:** `const worker = await createWorker('eng');` is awaited *before* the `try` block.
When `createWorker` rejects (network error fetching the eng traineddata, native module
loading failure, missing cache permissions), the rejection bubbles out of
`scoreOcrTextPresence`. `runScorers` does not catch per-scorer, so the rejection unwinds
into `runEval`'s outer `catch` (`src/eval/run.ts:105`) and the *entire* eval case is
recorded as `status: 'error'` with empty `scores: []`. This loses the partial pixel_delta
score that was computed earlier in the same iteration of `runScorers` and contradicts the
explicit `catch` branch already present in this function (lines 94-99) that converts
runtime errors into `{ scorer, status: 'error', reason }`. Two failure modes for the same
scorer therefore produce different result shapes, and downstream consumers
(`apply-results.ts`) cannot tell that the OCR scorer specifically failed.

**Fix:**
```ts
export async function scoreOcrTextPresence(
  outputPath: string,
  expectedText?: string,
): Promise<EvalScore> {
  if (!expectedText || !expectedText.trim()) {
    return { scorer: 'ocr_text_presence', status: 'error', reason: 'expectedText is required for OCR scoring' };
  }

  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  try {
    worker = await createWorker('eng');
    const result = await worker.recognize(outputPath);
    const recognizedText = normalizeOcrText(result.data.text);
    const needle = normalizeOcrText(expectedText);
    return recognizedText.includes(needle)
      ? { scorer: 'ocr_text_presence', status: 'scored', value: 1 }
      : { scorer: 'ocr_text_presence', status: 'scored', value: 0, reason: 'expected text not found' };
  } catch (error) {
    return {
      scorer: 'ocr_text_presence',
      status: 'error',
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (worker) {
      await worker.terminate().catch(() => undefined);
    }
  }
}
```

### WR-02: `isEvalCase` blanket-casts unknown to `EvalCase` and accepts arbitrary `op`/`provider` strings

**File:** `src/eval/cases.ts:14-29`
**Issue:** The first line of the type guard is `const evalCase = value as EvalCase;` — any
unknown shape is asserted to be `EvalCase` before validation, defeating the type guard.
Worse, `op` and `provider` are validated only as `typeof ... === 'string'`. A typo such as
`"extract_subjct"` passes the loader, then fails much later in `runEval` with the
generic "capability not registered" path (recorded as `skipped`, not flagged as malformed).
Production capability ops are a closed set in `CapabilityOp`; the loader should enforce it
so the failure surfaces at load time.

**Fix:**
```ts
const CAPABILITY_OPS = new Set<CapabilityOp>(['extract_subject', 'edit_prompt']);

function isEvalCase(value: unknown): value is EvalCase {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || !v.id.trim()) return false;
  if (typeof v.op !== 'string' || !CAPABILITY_OPS.has(v.op as CapabilityOp)) return false;
  if (typeof v.provider !== 'string' || !v.provider.trim()) return false;
  if (typeof v.fixtureId !== 'string' || !v.fixtureId.trim()) return false;
  if (typeof v.params !== 'object' || v.params === null) return false;
  if (!Array.isArray(v.scorers) || !v.scorers.every((s) => SCORERS.has(s as EvalScorerId))) return false;
  if (v.requiredEnv !== undefined &&
      (!Array.isArray(v.requiredEnv) || !v.requiredEnv.every((e) => typeof e === 'string'))) return false;
  return true;
}
```

### WR-03: `loadEvalCases` does not validate `expectedText` type for non-OCR cases

**File:** `src/eval/cases.ts:56-61`
**Issue:** The OCR-specific check rejects missing or blank `expectedText`, but if a non-OCR
case includes `expectedText` set to a non-string (e.g., the JSON author wrote
`"expectedText": 50`), it is silently passed through into `evalCase.params`. `runEval`'s
`getExpectedText` returns `undefined` for non-strings and the bug becomes invisible —
authors will assume the value was passed when in fact it was dropped. Either reject any
non-string `expectedText` regardless of scorer, or strip the key explicitly.

**Fix:**
```ts
if (
  entry.params.expectedText !== undefined &&
  (typeof entry.params.expectedText !== 'string' || !entry.params.expectedText.trim())
) {
  throw new Error(`Eval case ${entry.id} has invalid params.expectedText (must be non-empty string when provided)`);
}
```
Then the existing OCR-required check can be simplified to a presence check.

### WR-04: Partial-alpha test does not assert the actual coverage value

**File:** `tests/eval/scorers.test.ts:30-43`
**Issue:** The first test paints a 2×4 black rectangle at `fill-opacity="0.5"` over a 4×4
canvas — the *deterministic* expected coverage is `8/16 = 0.5`. The test only asserts
`> 0` and `<= 1`, which would still pass if the loop accidentally counted the
fully-transparent half of the canvas (a regression that would yield `1.0`). The
"opaque hard-mask" case below it does assert `0.5` exactly; the partial-alpha case should
do the same to detect regressions where translucent and transparent are no longer
distinguished.

**Fix:** replace the loose assertion with `expect(score.value).toBe(0.5);` (or
`toBeCloseTo(0.5, 5)` if antialiasing introduces sub-pixel jitter at this 4×4 size; the
sibling hard-mask test demonstrates the exact value is reproducible).

## Info

### IN-01: OCR worker is created and terminated on every scorer call

**File:** `src/eval/scorers.ts:76-101`
**Issue:** Performance is out of scope for v1 review, but it is worth noting that
`createWorker('eng')` initializes WASM, downloads/loads ~10 MB of trained data, and spins
up a worker thread on every call. With two OCR cases in `edit-prompt.json` today, that is
two full initializations per eval run. The worker object can be cached at module scope
(or accepted as an injected dependency by `runScorers`) and reused across cases. Mark this
as future work — a cached worker would also make WR-01's failure handling simpler.

### IN-02: `normalizeOcrText` does not strip punctuation or OCR substitution noise

**File:** `src/eval/scorers.ts:12-14`
**Issue:** Normalization is whitespace+lowercase only. Tesseract commonly emits punctuation
adjacent to characters (e.g., `"SALE-50"`, `"SALE 50."`, `"SALE  50!"`). The first two are
fine because `.includes('sale 50')` still matches, but a hyphen would not. Consider
stripping non-alphanumeric runs to whitespace before collapse, or document explicitly that
expected text should match the OCR engine's verbatim output. This is most likely to bite
on the upcoming `edit-text-poster` (`CLOSED`) case if Tesseract emits `"CLOSED."`.

**Fix:**
```ts
function normalizeOcrText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
```

### IN-03: `'${fixture.path}'` placeholder substitution silently no-ops on missing input

**File:** `src/eval/cases.ts:63-66`
**Issue:** If `params.input` is omitted entirely (or set to a different placeholder
string), the loader leaves `params` unchanged and the case fails much later in `runEval`
at `getInputPath`. Since the placeholder string is the documented contract for fixture
substitution, the loader is the right place to enforce that an `input` field is present
and either equals `${fixture.path}` or is an absolute path. Pre-existing behavior, but
worth tightening alongside the WR-02 schema work.

### IN-04: `EVAL-03` acceptance test asserts on raw source text, not behavior

**File:** `tests/eval/phase7.acceptance.test.ts:57-75`
**Issue:** The test reads `src/eval/scorers.ts` and `src/eval/cases.ts` as text and greps
for specific substrings (`"expectedText": "SALE 50"`, `'ocr_text_presence but is missing
params.expectedText'`). This couples the test to exact wording — a reasonable error
message rephrasing would break it without indicating any actual behavior regression. The
behavioral assertions exist already in `tests/eval/cases.test.ts` and the OCR tests in
`tests/eval/scorers.test.ts`; the source-grep checks are a brittle belt-and-braces layer.
Acceptable as a phase-gate sentinel, but tag/document it as such so future maintainers
don't preserve the literal strings unnecessarily.

---

_Reviewed: 2026-05-02_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
