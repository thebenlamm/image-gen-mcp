---
phase: 06-run-session-artifact-layer
plan: 01
subsystem: filesystem
tags: [runs, artifacts, retention, vitest, typescript]
requires:
  - phase: 05-capability-layer-image-op-first-2-caps
    provides: image_op response shape and capability operation types
provides:
  - Standalone src/runs module for run IDs, run directories, atomic writes, manifests, retention, and traces
  - Vitest 2.x test runner configuration and scripts
  - Unit coverage for RUN-01 through RUN-04 module behavior
affects: [06-run-session-artifact-layer, 07-eval-harness, 09-image-task-planner-dag-executor]
tech-stack:
  added: [vitest@^2.1.9]
  patterns: [tmp-plus-rename atomic writes, mtime-based retention, trace nodes with artifact paths]
key-files:
  created:
    - src/runs/id.ts
    - src/runs/dir.ts
    - src/runs/write.ts
    - src/runs/trace.ts
    - src/runs/manifest.ts
    - src/runs/retention.ts
    - src/runs/index.ts
    - tests/runs/id.test.ts
    - tests/runs/write.test.ts
    - tests/runs/dir.test.ts
    - tests/runs/retention.test.ts
    - tests/helpers/tmpOutputDir.ts
    - vitest.config.ts
  modified:
    - package.json
    - package-lock.json
key-decisions:
  - "Vitest 2.x is the Phase 6 test framework; tsconfig was left unchanged because tests run through Vitest transform and build only includes src."
  - "Run artifact roots resolve from server-level IMAGE_GEN_OUTPUT_DIR via getOutputDir(), not per-call outputDir."
  - "Trace nodes preserve latencyMs while adding startedAtMs, endedAtMs, durationMs, outcome, and artifactPath."
patterns-established:
  - "Run IDs are regex-validated before path construction, with resolved path containment checked before mkdir."
  - "Retention sweep is fail-soft and symlink-safe, scanning only real run-* directories below .runs."
  - "Manifest writes use the shared writeFileAtomic helper."
requirements-completed: [RUN-01, RUN-02, RUN-03, RUN-04]
duration: 4min
completed: 2026-05-02
---

# Phase 06 Plan 01: Runs Module Foundation Summary

**Standalone run artifact module with sortable run IDs, atomic file writes, mtime retention sweep, manifest schema, trace contracts, and Vitest coverage**

## Performance

- **Duration:** 4 min
- **Started:** 2026-05-02T00:01:24Z
- **Completed:** 2026-05-02T00:05:25Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments

- Added `src/runs/` primitives for run ID generation, `.runs` root resolution, run directory validation, node artifact paths, atomic writes, manifest writing, retention parsing, retention sweeping, and trace node construction.
- Installed Vitest 2.x and added `test`, `test:watch`, and `test:runs` scripts without changing `tsconfig.json`.
- Covered RUN-01..RUN-04 module behavior with 24 passing tests, including symlink skip, non-run sibling skip, missing/empty `.runs`, and `retentionHours=0`.
- Kept this plan standalone: `src/index.ts` was not wired to the runs module; that remains plan 06-02.

## Task Commits

Each task was committed atomically:

1. **Task 1: Install vitest, add scripts, create runs module skeleton with types** - `7e132eb` (feat)
2. **Task 2 RED: Add failing runs module tests** - `103ca9b` (test)
3. **Task 2 GREEN: Implement manifest + retention** - `a194f7b` (feat)

## Files Created/Modified

- `package.json` - Added Vitest scripts and dev dependency.
- `package-lock.json` - Captured Vitest 2.x dependency graph.
- `vitest.config.ts` - Configured Node environment, test include glob, and 10s timeout.
- `src/runs/id.ts` - Added `RUN_ID_REGEX` and `createRunId()`.
- `src/runs/dir.ts` - Added `.runs` root, run directory, manifest path, and node artifact helpers with path validation.
- `src/runs/write.ts` - Added tmp-plus-rename atomic writer with best-effort tmp cleanup.
- `src/runs/trace.ts` - Added forward-compatible `Trace`/`TraceNode` types and `buildTraceNode()`.
- `src/runs/manifest.ts` - Added run manifest schema and atomic writer.
- `src/runs/retention.ts` - Added retention parser and fail-soft retention sweep.
- `src/runs/index.ts` - Added barrel exports for the runs module.
- `tests/helpers/tmpOutputDir.ts` - Added isolated temp output-dir helper.
- `tests/runs/*.test.ts` - Added unit coverage for run IDs, atomic writes, directory helpers, and retention.

## Decisions Made

- Used `vitest@^2.1.9`, the latest 2.x satisfying the plan’s `^2.1.0` constraint.
- Left `tsconfig.json` unchanged. Tests are outside the build include and run through Vitest transform.
- Kept `.runs` literal centralized in `RUN_DIR_NAME` in `src/runs/dir.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Replaced invalid ESM spy in write failure test**
- **Found during:** Task 2 RED
- **Issue:** `vi.spyOn(fs, 'writeFile')` cannot redefine the ESM `fs/promises.writeFile` export in this setup.
- **Fix:** The test now forces a real write failure by targeting a missing parent directory, then asserts no final file exists.
- **Files modified:** `tests/runs/write.test.ts`
- **Verification:** RED run failed only because `src/runs/retention.ts` was missing; GREEN run passed all tests.
- **Committed in:** `103ca9b`

**Total deviations:** 1 auto-fixed blocking test issue.
**Impact on plan:** Test intent is preserved. No production scope changed.

## Issues Encountered

- `npx vitest run --reporter=verbose tests/` during Task 1 returned "No test files found" before Task 2 created tests. This was expected for the skeleton state and matched the plan’s permissive Task 1 verification.
- `npm install` reported pre-existing audit findings: 20 vulnerabilities. This plan did not include dependency audit remediation.

## Verification

- `npm run build` - passed
- `npm test` - passed, 4 files / 24 tests
- `npx vitest run tests/runs/retention.test.ts -t "retentionHours=0 deletes all"` - passed
- `grep -r '\.runs' src/runs/ | grep -v '^src/runs/dir.ts'` - no matches
- `grep -r 'runs/' src/index.ts` - no matches

## Known Stubs

None.

## Threat Flags

None. New filesystem and retention surfaces are exactly the surfaces covered by the plan threat model.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 06-02 can wire `src/runs` into `image_op` and startup retention using the exported module API. The trace contract is ready for later multi-node DAG reuse without reshaping.

## Self-Check: PASSED

- Found summary file, key run module files, and retention tests.
- Found task commits `7e132eb`, `103ca9b`, and `a194f7b`.

---
*Phase: 06-run-session-artifact-layer*
*Completed: 2026-05-02*
