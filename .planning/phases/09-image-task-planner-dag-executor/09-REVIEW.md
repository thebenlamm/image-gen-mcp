---
phase: 09-image-task-planner-dag-executor
reviewed: 2026-05-03T16:30:52Z
depth: standard
files_reviewed: 34
files_reviewed_list:
  - README.md
  - package.json
  - src/capabilities/analyze-dimensions.ts
  - src/capabilities/analyze-ocr.ts
  - src/capabilities/analyze-palette.ts
  - src/capabilities/composite-layers.ts
  - src/capabilities/edit-prompt.ts
  - src/capabilities/enhance-upscale.ts
  - src/capabilities/extract-subject.ts
  - src/capabilities/transform.ts
  - src/index.ts
  - src/runs/manifest.ts
  - src/runs/trace.ts
  - src/task/best-partial.ts
  - src/task/dag-executor.ts
  - src/task/index.ts
  - src/task/plan-schema.ts
  - src/task/plan-validator.ts
  - src/task/planner.ts
  - src/task/ref-resolver.ts
  - src/task/serialize-response.ts
  - src/utils/path-input-root.ts
  - tests/integration/__helpers__/image-task-mocks.ts
  - tests/integration/image_task.dag.test.ts
  - tests/integration/image_task.dry-run.test.ts
  - tests/integration/image_task.e2e.test.ts
  - tests/integration/image_task.failure.test.ts
  - tests/task/best-partial.test.ts
  - tests/task/dag-executor.test.ts
  - tests/task/plan-schema.test.ts
  - tests/task/plan-validator.test.ts
  - tests/task/planner.test.ts
  - tests/task/ref-resolver.test.ts
  - tests/task/serialize-response.test.ts
  - tests/utils/path-input-root.test.ts
findings:
  critical: 3
  warning: 2
  info: 0
  total: 5
status: issues_found
---

# Phase 09: Code Review Report

**Reviewed:** 2026-05-03T16:30:52Z
**Depth:** standard
**Files Reviewed:** 34
**Status:** issues_found

## Summary

Reviewed the image task planner, validator, DAG executor, response serializer, capability wrappers, docs, and tests. The implementation has several correctness and security-contract gaps in plan validation and run bookkeeping. The full test suite currently passes (`38` files, `202` tests), but the missing cases below allow invalid plans to validate or leave run state inconsistent.

## Critical Issues

### CR-01: BLOCKER - Node References Do Not Require DAG Dependencies

**File:** `src/task/plan-validator.ts:222`
**Issue:** The validator checks that `$nodes.<id>.output` references point at an existing node, but it never requires the current node to depend on that referenced node. A planner can return a node with `params.input: "$nodes.extract.output"` and `dependsOn: []`; validation succeeds, then `executeDag` may run it before `extract` and fail at ref resolution (`src/task/dag-executor.ts:260`). This turns a valid-looking dry run into an execution failure and makes behavior depend on node array order.
**Fix:**
```ts
for (const { node, field, value } of strings) {
  const nodeMatch = NODE_REF_RE.exec(value);
  if (!nodeMatch) continue;
  const referencedId = nodeMatch[1];
  if (!node.dependsOn.includes(referencedId)) {
    errors.push({
      code: 'PLAN_MISSING_DEP',
      message: `Node '${node.id}' references '${value}' but does not depend on '${referencedId}'`,
      nodeId: node.id,
      field,
      suggestion: `Add '${referencedId}' to dependsOn.`,
    });
  }
}
```

### CR-02: BLOCKER - Validator Trusts Planner-Supplied outputKind

**File:** `src/task/plan-validator.ts:303`
**Issue:** `terminalNodeId` is accepted as image-producing solely because the plan says `outputKind: "image"`. There is no validation that `outputKind` matches the operation. For example, `op: "analyze_dimensions"` with `outputKind: "image"` can pass terminal validation, execute as a data result, and produce a response with `success: false` but no failed node or useful validation error.
**Fix:**
```ts
const EXPECTED_OUTPUT_KIND: Record<string, 'image' | 'data'> = {
  extract_subject: 'image',
  edit_prompt: 'image',
  composite_layers: 'image',
  transform: 'image',
  enhance_upscale: 'image',
  analyze_dimensions: 'data',
  analyze_palette: 'data',
  analyze_ocr: 'data',
};

for (const node of plan.nodes) {
  const expected = EXPECTED_OUTPUT_KIND[node.op];
  if (node.outputKind !== expected) {
    errors.push({
      code: 'PLAN_OUTPUT_KIND_MISMATCH',
      message: `Node '${node.id}' op '${node.op}' must declare outputKind '${expected}'`,
      nodeId: node.id,
      field: 'outputKind',
    });
  }
}
```

### CR-03: BLOCKER - Dry Runs Bypass IMAGE_GEN_INPUT_ROOT For Input Refs

**File:** `src/task/plan-validator.ts:351`
**Issue:** Literal image paths are checked against `IMAGE_GEN_INPUT_ROOT`, but `$inputs.*` references are skipped. Execution eventually relies on each built-in capability to re-check the resolved path, but `dry_run` returns after validation (`src/index.ts:997`) and never invokes those capability checks. That means a dry run can report a valid plan even when `input_images` points outside the configured root, violating the documented input validation contract.
**Fix:**
```ts
for (const [inputName, inputPath] of Object.entries(ctx.inputImages)) {
  try {
    await assertWithinInputRoot(inputPath);
  } catch (error) {
    errors.push({
      code: 'INPUT_PATH_OUTSIDE_ROOT',
      message: error instanceof Error ? error.message : String(error),
      field: `$inputs.${inputName}`,
      suggestion: 'Place input files under IMAGE_GEN_INPUT_ROOT or unset IMAGE_GEN_INPUT_ROOT.',
    });
  }
}
```

## Warnings

### WR-01: WARNING - Accepted seed Parameter Is Ignored

**File:** `src/index.ts:982`
**Issue:** `image_task` exposes `seed` as a reproducibility input, but `planImageTask` only accepts `{ model, timeoutMs }` (`src/task/planner.ts:154`) and does not pass a seed to Anthropic (`src/task/planner.ts:175`). The `as never` cast hides the mismatch, so callers get no reproducibility guarantee from a documented parameter.
**Fix:** Either remove `seed` from the MCP schema and README, or add it to planner options and use it in the provider request if supported. If Anthropic does not support request seeds here, reject `seed` with a clear validation error instead of silently ignoring it.

### WR-02: WARNING - Early image_task Exits Leave Manifests in_progress

**File:** `src/index.ts:962`
**Issue:** `handleImageTask` writes an initial `in_progress` manifest, then returns immediately on planner failure, validation failure, or dry run (`src/index.ts:985`, `src/index.ts:994`, `src/index.ts:998`) without writing a terminal manifest. This leaves completed runs looking active on disk and makes run history unreliable.
**Fix:** Add a helper that writes a final manifest before every early return, using `status: "error"` for planner/validation failures and `status: "success"` for dry runs, with `endedAt`, `plan` when available, and the relevant error or dry-run totals.

---

_Reviewed: 2026-05-03T16:30:52Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
