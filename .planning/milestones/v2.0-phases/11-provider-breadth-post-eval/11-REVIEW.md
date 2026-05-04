---
phase: 11-provider-breadth-post-eval
reviewed: 2026-05-03T23:12:32Z
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
  critical: 0
  warning: 3
  info: 0
  total: 3
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-05-03T23:12:32Z
**Depth:** standard
**Files Reviewed:** 31
**Status:** issues_found

## Summary

Reviewed the Phase 11 provider-breadth sources and tests after the prior critical fixes. No remaining critical findings were found, but the new provider adapters still have contract and robustness defects that can produce wrong output or hang tool calls.

## Warnings

### WR-01: Photoroom composite ignores the canonical canvas background field

**File:** `src/capabilities/photoroom-composite-layers.ts:174`
**Issue:** `PhotoroomCompositeParams` accepts `canvas.background` at lines 25-28, matching the existing `composite_layers` contract and template output, but invocation only reads `params.background.color` / `params.background.prompt`. A valid plan using `canvas.background` is accepted and then silently sent to Photoroom without the requested background, producing transparent/default output instead of the requested composition.
**Fix:**
```ts
const canvasBackground = params.canvas?.background;
if (typeof params.background?.color === 'string') {
  form.set('background.color', params.background.color.replace(/^#/, ''));
} else if (isRgbBackground(canvasBackground)) {
  form.set('background.color', rgbToHex(canvasBackground));
} else if (canvasBackground !== undefined) {
  throw new CapabilityInvokeError(
    'CONSTRAINT_VIOLATION',
    'composite_layers:photoroom supports canvas.background only as an opaque RGB color',
    false,
  );
}
```
Add a test that passes `canvas: { width, height, background: { r: 255, g: 255, b: 255, alpha: 1 } }` and asserts the outgoing form contains `background.color=FFFFFF`, or reject unsupported `canvas.background` before the network call.

### WR-02: Remote provider calls can hang indefinitely because some fetches have no timeout

**File:** `src/capabilities/ideogram-generate.ts:122`
**Issue:** The Ideogram generation POST has no `AbortController`, and the fal status/result fetches at `src/capabilities/fal-edit-prompt.ts:91` have no per-request timeout. A stalled TCP request can keep `image_op`, `image_task`, or eval runs open indefinitely; the fal poll loop timeout only applies between completed status requests, not to a stuck status or result fetch.
**Fix:** Wrap every provider fetch in a shared timeout helper and convert aborts to retryable `CapabilityInvokeError('TIMEOUT', ...)`.
```ts
async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new CapabilityInvokeError('TIMEOUT', 'provider request timed out', true);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
```
Cover Ideogram generation timeout and fal status/response timeout in tests.

### WR-03: Composite layer validation crashes on non-object layer entries

**File:** `src/capabilities/photoroom-composite-layers.ts:105`
**Issue:** `layers` is only checked as an array before the loop. If a caller passes `layers: [null]`, `layers: ['x']`, or another non-object entry, `layer.input` throws a raw `TypeError` instead of a non-retryable `CONSTRAINT_VIOLATION`. The generic validator has the same unchecked cast in `src/capabilities/validation.ts:82`, so malformed JSON can bypass the intended validation path and surface inconsistent errors through `image_op`, `image_task`, and plan validation.
**Fix:**
```ts
const layer = layers[index];
if (!layer || typeof layer !== 'object' || Array.isArray(layer)) {
  throw new CapabilityInvokeError(
    'CONSTRAINT_VIOLATION',
    `composite_layers.layers[${index}] must be an object`,
    false,
  );
}
```
Apply the same object guard in `validateCapabilityParams` before reading `layer.input`, and add tests for `layers: [null]` and `layers: ['bad']`.

---

_Reviewed: 2026-05-03T23:12:32Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
