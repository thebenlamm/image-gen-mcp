---
phase: 11-provider-breadth-post-eval
reviewed: 2026-05-03T21:06:43Z
depth: standard
files_reviewed: 31
files_reviewed_list:
  - README.md
  - eval/cases/fal-flux-kontext.json
  - eval/cases/ideogram.json
  - eval/cases/photoroom.json
  - src/capabilities/fal-edit-prompt.ts
  - src/capabilities/ideogram-generate.ts
  - src/capabilities/photoroom-composite-layers.ts
  - src/capabilities/photoroom-extract-subject.ts
  - src/capabilities/register.ts
  - src/capabilities/types.ts
  - src/capabilities/validation.ts
  - src/eval/cases.ts
  - src/eval/run.ts
  - src/eval/scorers.ts
  - src/index.ts
  - src/task/dag-executor.ts
  - src/task/plan-schema.ts
  - src/task/plan-validator.ts
  - src/task/planner.ts
  - tests/capabilities/fal-edit-prompt.test.ts
  - tests/capabilities/ideogram-generate.test.ts
  - tests/capabilities/photoroom-composite-layers.test.ts
  - tests/capabilities/photoroom-extract-subject.test.ts
  - tests/capabilities/registry-quality.test.ts
  - tests/eval/apply-results.test.ts
  - tests/eval/cases.test.ts
  - tests/eval/run.test.ts
  - tests/task/dag-executor.test.ts
  - tests/task/plan-validator.test.ts
  - tests/task/planner.test.ts
  - tests/task/templates.test.ts
findings:
  critical: 3
  warning: 2
  info: 0
  total: 5
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-05-03T21:06:43Z
**Depth:** standard
**Files Reviewed:** 31
**Status:** issues_found

## Summary

Reviewed the provider breadth changes, eval cases, planner/validator integration, and tests. The main risk is `composite_layers:photoroom`: it is registered as a multi-layer composition provider, but the implementation uploads only one image, ignores the documented layer positioning contract, and is blocked by a top-level `params.input` validation requirement that the public docs say is not required.

## Critical Issues

### CR-01: BLOCKER - Photoroom Composite Is Rejected By Shared Validation For Documented Calls

**File:** `src/capabilities/photoroom-composite-layers.ts:127`
**Issue:** The capability declares `requiresInputImage: true`, so `validateCapabilityParams` rejects any `image_op`/`image_task` call that only supplies `canvas` and `layers`. That contradicts the public tool docs, which list `composite_layers:photoroom` requirements as `PHOTOROOM_API_KEY`, `params.canvas`, and `params.layers[]` in `README.md:413`. The provider's own `invoke` path also reads `layers[0].input`, not `params.input`, so a documented Photoroom composite call cannot pass through the normal MCP entry points.
**Fix:**
```ts
constraints: {
  requiresInputImage: false,
  supportsMultipleInputs: true,
  outputFormat: 'png',
},
```
Then add a regression test through `handleImageOp` or `validatePlan` for `composite_layers/photoroom` with only `canvas` and `layers`.

### CR-02: BLOCKER - Layer Composition Parameters Are Not Applied To Photoroom Requests

**File:** `src/capabilities/photoroom-composite-layers.ts:139`
**Issue:** The adapter reads only `layers[0].input` and sends that single file as `imageFile`; additional layer image files are never uploaded. It then sends `x`, `y`, `scale`, `opacity`, and `anchor` inside a custom `imageGenMcp.layers` field at line 156. Photoroom's documented Image Editing API accepts one `imageFile`/`imageUrl` plus documented edit and positioning fields (see https://docs.photoroom.com/api-reference-openapi); it will not apply this custom layer list. As a result, multi-layer input is silently reduced to one image and requested placement/opacity are ignored.
**Fix:** Either narrow the capability to what Photoroom actually supports, or implement the advertised contract before calling Photoroom. For example:
```ts
if (layers.length !== 1) {
  throw new CapabilityInvokeError(
    'CONSTRAINT_VIOLATION',
    'photoroom composite_layers currently supports exactly one subject layer',
    false,
  );
}
// Remove imageGenMcp.layers and translate supported placement fields to documented
// Photoroom positioning parameters, or pre-compose layers locally with sharp first.
```
Also set `supportsMultipleInputs: false` if only one uploaded subject is supported.

### CR-03: BLOCKER - Photoroom Composite Eval Scores The Wrong Input Semantics

**File:** `eval/cases/photoroom.json:35`
**Issue:** The composite eval case sets `params.input` to `${fixture.path}` and `pixel_delta` compares the provider output against that fixture via `src/eval/run.ts:107-123`, but the capability ignores `params.input` and uploads `layers[0].input` instead at `src/capabilities/photoroom-composite-layers.ts:139`. This means the Phase 11 eval is not measuring the documented composite scenario; it compares an edit of `composite-overlay.png` against `composite-bg.png`. Any quality score from this case is invalid for routing decisions.
**Fix:** Align the eval and capability contract. If Photoroom edits a single subject image, remove the top-level `input` from the case and use an appropriate scorer/golden for the subject output. If the intended contract is background plus overlay composition, implement that contract first and ensure the eval invokes the same fields production uses.

## Warnings

### WR-01: WARNING - Ideogram Generate Request Can Hang Indefinitely

**File:** `src/capabilities/ideogram-generate.ts:122`
**Issue:** The initial Ideogram API call has no `AbortController` timeout. Downloading the ephemeral image URL is bounded, but a stalled generate request can hang an `image_op`, `image_task`, or eval run indefinitely.
**Fix:** Wrap the generate `fetch` in the same timeout pattern used by Photoroom and fal submit calls:
```ts
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
try {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Api-Key': apiKey },
    body: form,
    signal: controller.signal,
  });
  // ...
} catch (error) {
  if (error instanceof Error && error.name === 'AbortError') {
    throw new CapabilityInvokeError('TIMEOUT', 'Ideogram generate timed out after 30s', true);
  }
  throw error;
} finally {
  clearTimeout(timer);
}
```

### WR-02: WARNING - fal Queue Poll Requests Are Not Bounded Per Request

**File:** `src/capabilities/fal-edit-prompt.ts:90`
**Issue:** `resolveFalResult` enforces an overall 60s loop, but each `fetchFalJson` call can hang because it has no abort signal. A stalled status or response URL request bypasses the intended queue timeout and can leave the caller waiting indefinitely.
**Fix:** Add a timeout parameter to `fetchFalJson` and call it with an `AbortController`, mapping aborts to retryable `TIMEOUT`.

---

_Reviewed: 2026-05-03T21:06:43Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
