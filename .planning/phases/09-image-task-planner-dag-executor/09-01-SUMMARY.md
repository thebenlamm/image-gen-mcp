---
phase: 09-image-task-planner-dag-executor
plan: 01
subsystem: planner
tags: [typescript, zod, anthropic, vitest, path-security, capability-registry]
requires:
  - phase: 07-eval-harness-golden-set
    provides: measured capability quality scores for planner routing
  - phase: 08-op-primitives-expansion
    provides: complete capability op taxonomy consumed by PlanSchema and validator
provides:
  - Zod PlanSchema and PlanNodeSchema contract for image_task DAG plans
  - Anthropic Haiku planner wrapper returning typed plans and planner reasoning
  - Registry-aware 12-pass plan validator with budget and latency gates
  - IMAGE_GEN_INPUT_ROOT path containment utility wired into every input-reading capability
affects: [09-image-task-planner-dag-executor, 10-template-fast-paths-executor-parallelism, image_task, image_op]
tech-stack:
  added: ["@anthropic-ai/sdk@^0.92.0"]
  patterns: [Zod plan contract, PlannerError taxonomy, 12-pass validator, realpath path containment]
key-files:
  created:
    - src/task/plan-schema.ts
    - src/task/plan-validator.ts
    - src/task/planner.ts
    - src/utils/path-input-root.ts
    - tests/task/plan-schema.test.ts
    - tests/task/plan-validator.test.ts
    - tests/task/planner.test.ts
    - tests/utils/path-input-root.test.ts
  modified:
    - package.json
    - package-lock.json
    - src/capabilities/extract-subject.ts
    - src/capabilities/edit-prompt.ts
    - src/capabilities/composite-layers.ts
    - src/capabilities/transform.ts
    - src/capabilities/enhance-upscale.ts
    - src/capabilities/analyze-dimensions.ts
    - src/capabilities/analyze-palette.ts
    - src/capabilities/analyze-ocr.ts
key-decisions:
  - "PlanNode.reason is the per-node planner rationale field; executor will later copy it into trace and augment with revisedPrompt."
  - "Plan validation recomputes cost from nodes and gates budget caps on the recomputed sum, not Haiku's estimate."
  - "IMAGE_GEN_INPUT_ROOT remains opt-in and no-op when unset; when set, checks happen at validation and capability invocation."
patterns-established:
  - "PlannerError mirrors CapabilityInvokeError with code, retryable, and suggestion fields."
  - "Validator uses collect-all semantics for refs/capabilities/params/paths and first-error-fail for DAG, terminal, budget, and latency gates."
requirements-completed: [TASK-01, TASK-02, TASK-03, TASK-05, TASK-10]
duration: 9min
completed: 2026-05-03
---

# Phase 09 Plan 01: Planner Contract Summary

**Typed Haiku plan generation, 12-pass registry validation, and opt-in realpath input-root containment for image_task DAGs**

## Performance

- **Duration:** 9 min
- **Started:** 2026-05-03T15:49:28Z
- **Completed:** 2026-05-03T15:58:07Z
- **Tasks:** 10
- **Files modified:** 18

## Accomplishments

- Added the durable `PlanSchema` execution contract with strict refs, eight capability ops, cost/latency estimates, terminal node, and per-node `reason`.
- Added `planImageTask()` using `@anthropic-ai/sdk`, `claude-haiku-4-5`, `messages.parse`, and `zodOutputFormat(PlanSchema)`.
- Added `validatePlan()` with all 12 ordered passes, including `BUDGET_CAP_EXCEEDED` before any provider invocation.
- Added `assertWithinInputRoot()` and wired it into all eight capability invokes as defense-in-depth.
- Added 35 new focused tests across schema, path-root, validator, and planner modules.

## Task Commits

1. **Task 1: Install @anthropic-ai/sdk** - `8105d35` (chore)
2. **Task 2: Create plan schema** - `d00cd20` (feat)
3. **Task 3: Create path input-root utility** - `29fb991` (feat)
4. **Task 4: Wire path guard into capabilities** - `3ee1d03` (feat)
5. **Task 5: Create plan validator** - `fa521be` (feat)
6. **Task 6: Create Anthropic planner** - `2b08141` (feat)
7. **Task 7: Create plan-schema tests** - `d00cd20` (included with Task 2)
8. **Task 8: Create path-input-root tests** - `29fb991` (included with Task 3)
9. **Task 9: Create plan-validator tests** - `fa521be` (included with Task 5)
10. **Task 10: Create planner tests** - `2b08141` (included with Task 6)

## Files Created/Modified

- `src/task/plan-schema.ts` - Zod plan, node, params, and ref schemas plus inferred TS types.
- `src/task/plan-validator.ts` - 12-pass plan validator with registry, param, path, budget, and latency checks.
- `src/task/planner.ts` - Anthropic Haiku planner client with structured-output parsing and error taxonomy.
- `src/utils/path-input-root.ts` - `IMAGE_GEN_INPUT_ROOT` containment guard using `fs.realpath` and `path.sep` boundary checks.
- `src/capabilities/*.ts` - Defensive path-root checks before every capability reads input file paths.
- `tests/task/*.test.ts` and `tests/utils/path-input-root.test.ts` - 35 new regression tests.
- `package.json` and `package-lock.json` - Added `@anthropic-ai/sdk@^0.92.0`.

## Decisions Made

- Kept per-op params as `z.record(z.unknown())` in `PlanSchema`; the validator delegates to `validateCapabilityParams()` so capability validation remains single-source.
- Treated non-existent input paths under `IMAGE_GEN_INPUT_ROOT` as valid during validation, mapping them against the real root. This supports future executor artifacts that do not exist yet.
- Split planner Zod failures into two classes: SDK-helper parse failures are `PLANNER_PARSE`; defensive post-SDK `PlanSchema.parse()` failures are `PLANNER_INVALID_PLAN`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed macOS realpath mismatch for future paths**
- **Found during:** Task 3 (path-input-root utility)
- **Issue:** A non-existent path under `/var/...` failed containment because the root realpath resolved to `/private/var/...`.
- **Fix:** For ENOENT inputs under the configured root, map the relative path onto the root realpath before the boundary check.
- **Files modified:** `src/utils/path-input-root.ts`
- **Verification:** `npx vitest run tests/utils/path-input-root.test.ts`
- **Committed in:** `29fb991`

**2. [Rule 1 - Bug] Separated planner parse versus invalid-plan errors**
- **Found during:** Task 6 (planner tests)
- **Issue:** Defensive `PlanSchema.parse()` failures were mapped as `PLANNER_PARSE`, indistinguishable from SDK helper parse failures.
- **Fix:** Scoped the SDK call and defensive parse into separate try/catch blocks.
- **Files modified:** `src/task/planner.ts`
- **Verification:** `npx vitest run tests/task/planner.test.ts`
- **Committed in:** `2b08141`

**Total deviations:** 2 auto-fixed bugs.
**Impact on plan:** Both fixes preserve the planned behavior and clarify edge-case semantics.

## Known Stubs

None.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: outbound_api | `src/task/planner.ts` | New Anthropic HTTPS planner call using `ANTHROPIC_API_KEY`; covered by threat register T-09-01-03, T-09-01-05, and T-09-01-06. |
| threat_flag: filesystem_input | `src/utils/path-input-root.ts` and `src/capabilities/*.ts` | New opt-in file input containment checks; covered by threat register T-09-01-02 and T-09-01-08. |

## Issues Encountered

- Existing `.planning/STATE.md` was already modified when execution began; preserved and updated it rather than reverting.
- `gsd-sdk` was not installed under local `node_modules`, so state loading used the `gsd-sdk` CLI on `PATH`.

## Verification

- `npm run build` passed.
- `npx vitest run tests/task tests/utils/path-input-root.test.ts` passed: 4 files, 35 tests.
- `npx vitest run tests/capabilities` passed: 9 files, 47 tests.
- `npm test` passed: 30 files, 153 tests.
- Grep checks found `@anthropic-ai/sdk`, `BUDGET_CAP_EXCEEDED`, `claude-haiku-4-5`, and `realpath`.

## Next Phase Readiness

The next plan can consume `Plan`, `PlanNode`, `validatePlan()` success/failure envelopes, and `planImageTask()` output directly. The executor still needs to resolve `$inputs.*` and `$nodes.*.output`, execute DAG nodes, persist traces/manifests, and propagate `node.reason` plus capability `revisedPrompt`.

## Self-Check: PASSED

- Verified created files exist: `src/task/plan-schema.ts`, `src/task/plan-validator.ts`, `src/task/planner.ts`, `src/utils/path-input-root.ts`, and this summary.
- Verified task commits exist in git history: `8105d35`, `d00cd20`, `29fb991`, `3ee1d03`, `fa521be`, `2b08141`.

---
*Phase: 09-image-task-planner-dag-executor*
*Completed: 2026-05-03*
