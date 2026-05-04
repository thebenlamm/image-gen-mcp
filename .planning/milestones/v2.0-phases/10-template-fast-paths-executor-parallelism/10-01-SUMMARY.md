---
phase: 10-template-fast-paths-executor-parallelism
plan: 01
subsystem: task-planning
tags: [image_task, templates, planner, dag, vitest]

requires:
  - phase: 09-image-task-planner-dag-executor
    provides: image_task planner, plan validation, DAG execution, serialized response boundary
provides:
  - Template registry with ASSET_PRESETS-derived plans by reference
  - product-on-white, logo-cleanup, and upscale-export template fast paths
  - plannerMethod response metadata for template vs LLM routing
affects: [phase-10, image_task, generate_asset, planner-routing]

tech-stack:
  added: []
  patterns:
    - TDD RED/GREEN commits for serializer, templates, and image_task wiring
    - Template-emitted plans are defensively parsed with PlanSchema and revalidated by validatePlan

key-files:
  created:
    - src/task/templates.ts
    - tests/task/templates.test.ts
    - tests/integration/image_task.template.test.ts
  modified:
    - src/task/serialize-response.ts
    - src/task/index.ts
    - src/index.ts
    - tests/task/serialize-response.test.ts

key-decisions:
  - "plannerMethod lives only on SerializedImageTaskResponse, not Trace."
  - "ASSET_PRESETS-derived templates pass preset.operations by reference so v1.0 preset fixes propagate to image_task."
  - "Template matches still go through validatePlan before dry-run or execution."

patterns-established:
  - "TemplateBuilder: goal-normalized registry entries emit Plan objects and fail closed if any capability is unavailable."
  - "Manifest planner.model uses template:<templateId> for template-routed image_task runs."

requirements-completed: [TMPL-01, TMPL-02, TMPL-03]

duration: 7min 15s
completed: 2026-05-03
---

# Phase 10 Plan 01: Template Registry + Matcher Summary

**Template fast paths now skip Haiku planning for preset and recipe goals while preserving response transparency and plan validation.**

## Performance

- **Duration:** 7min 15s
- **Started:** 2026-05-03T18:58:31Z
- **Completed:** 2026-05-03T19:05:45Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Added `plannerMethod?: 'llm' | 'template'` to serialized `image_task` responses without changing `Trace`.
- Added `src/task/templates.ts` with ASSET_PRESETS-derived templates plus `product-on-white`, `logo-cleanup`, and `upscale-export`.
- Wired `handleImageTask` to call `matchTemplate` before `planImageTask`, with template manifest sentinel `template:<templateId>`.
- Verified TMPL requirements:
  - **TMPL-01:** `tests/task/templates.test.ts` mutates `ASSET_PRESETS.avatar.operations` and observes the next template plan reflect it.
  - **TMPL-02:** `tests/integration/image_task.template.test.ts` succeeds with `ANTHROPIC_API_KEY` unset and `plannerMethod: "template"`.
  - **TMPL-03:** `tests/task/templates.test.ts` covers `product-on-white`, `logo-cleanup`, and `upscale-export`.

## Task Commits

1. **Task 1 RED:** `246e09c` test(10-01): add failing planner method serializer tests
2. **Task 1 GREEN:** `368d0e2` feat(10-01): serialize image task planner method
3. **Task 2 RED:** `3f17116` test(10-01): add failing template registry tests
4. **Task 2 GREEN:** `147523f` feat(10-01): add image task template registry
5. **Task 3 RED:** `83071ef` test(10-01): add failing image task template integration tests
6. **Task 3 GREEN:** `75717c7` feat(10-01): route image task templates before planner

## Files Created/Modified

- `src/task/templates.ts` - Template registry, matchTemplate, listTemplateIds, PlanSchema defensive parse.
- `src/task/serialize-response.ts` - Optional top-level `plannerMethod`.
- `src/task/index.ts` - Re-export templates.
- `src/index.ts` - Template-first image_task planning branch and manifest planner metadata.
- `tests/task/templates.test.ts` - Unit coverage for template matching and ASSET_PRESETS reference propagation.
- `tests/task/serialize-response.test.ts` - Serializer coverage for top-level plannerMethod and unchanged Trace.
- `tests/integration/image_task.template.test.ts` - End-to-end template routing, dry-run, validation, manifest, and LLM fallback coverage.

## Decisions Made

- Kept `plannerMethod` out of `Trace`; it is response routing metadata, not executor trace data.
- Accepted underscore and hyphen aliases for explicit recipe templates while returning the matched normalized key.
- Template plans fail closed if the required capability is not registered.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Replaced invalid hardcoded PNG test fixture for real Sharp execution**
- **Found during:** Task 3 (image_task template integration)
- **Issue:** The integration test used the helper 1px PNG buffer, which Sharp rejected during the real transform capability path.
- **Fix:** Generated valid 16x16 PNG files with Sharp in the test setup.
- **Files modified:** `tests/integration/image_task.template.test.ts`
- **Verification:** `npx vitest run tests/integration/image_task.template.test.ts` passed.
- **Committed in:** `75717c7`

---

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** Test-only correction; no product behavior scope changed.

## Issues Encountered

None beyond the test fixture correction documented above.

## User Setup Required

None - no external service configuration required.

## Verification

- `npm run build` - passed
- `npx vitest run tests/task/templates.test.ts tests/task/serialize-response.test.ts tests/integration/image_task.template.test.ts` - 31 tests passed
- `npx vitest run tests/task tests/integration` - 111 tests passed
- `grep -c "import { ASSET_PRESETS" src/task/templates.ts` - returned 1
- `grep -c "plannerMethod" src/runs/trace.ts` - returned 0
- `ANTHROPIC_API_KEY=garbage npx vitest run tests/integration/image_task.template.test.ts` - 5 tests passed

## Known Stubs

None.

## Threat Flags

None - the new template bypass path is covered by the plan threat model and still passes through existing input-root and plan validation boundaries.

## Next Phase Readiness

Plan 10-02 can build on `plannerMethod` and `matchTemplate` for the sub-cent budget gate and executor parallelism work.

## Self-Check: PASSED

- Found `src/task/templates.ts`
- Found `tests/task/templates.test.ts`
- Found `tests/integration/image_task.template.test.ts`
- Found this summary file
- Found task commits `147523f` and `75717c7` in git history

---
*Phase: 10-template-fast-paths-executor-parallelism*
*Completed: 2026-05-03*
