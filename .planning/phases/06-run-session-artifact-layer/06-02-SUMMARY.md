---
phase: 06-run-session-artifact-layer
plan: 02
subsystem: mcp
tags: [mcp, integration, filesystem, vitest, trace]
requires:
  - phase: 06-01
    provides: runs module primitives for run IDs, run dirs, manifests, atomic writes, trace nodes, and retention sweep
provides:
  - image_op run artifact persistence with manifest-first success/error handling
  - startup retention sweep wiring with non-fatal error handling
  - import-safe src/index.ts exports for direct integration tests
  - trace snapshot contract for Phase 9 multi-node inheritance
affects: [phase-07-eval-harness, phase-09-image-task-planner-dag-executor, image_op, runs]
tech-stack:
  added: []
  patterns:
    - exported MCP tool handler for transport-free integration tests
    - manifest-first run persistence with final success/error manifest rewrite
    - redacted snapshot for volatile trace fields
key-files:
  created:
    - tests/integration/image_op.runs.test.ts
    - tests/integration/image_op.trace.test.ts
    - tests/integration/__snapshots__/image_op.trace.test.ts.snap
    - .planning/phases/06-run-session-artifact-layer/06-HUMAN-UAT.md
  modified:
    - src/index.ts
    - src/capabilities/registry.ts
    - src/runs/retention.ts
key-decisions:
  - "image_op run directories resolve from server-level IMAGE_GEN_OUTPUT_DIR via the runs module, not per-call outputDir."
  - "image_op now writes status='in_progress' before capability lookup/invocation, then rewrites status='success' or status='error'."
  - "retentionHours=0 means delete all eligible run directories, including just-created runs."
patterns-established:
  - "Direct handler tests import handleImageOp from src/index.ts without creating McpServer or connecting transports."
  - "Trace snapshots redact runId, timestamps, artifact paths, and output paths while locking node keys."
requirements-completed: [RUN-02, RUN-04, RUN-05]
duration: 7min
completed: 2026-05-02
---

# Phase 06 Plan 02: Wire Image Op Run Artifacts Summary

**image_op now writes persistent run artifacts and manifests, returns the Phase 9-compatible trace shape, and sweeps retained runs at server startup**

## Performance

- **Duration:** 7 min
- **Started:** 2026-05-02T00:08:24Z
- **Completed:** 2026-05-02T00:14:58Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Extracted `handleImageOp(args)` from the MCP registration closure and exported `createServer`, with `isDirectInvocation` guarding `main()` so imports do not block on stdio.
- Wired `image_op` to `src/runs/`: `createRunId`, `resolveRunDir`, `nodeArtifactPath`, `writeFileAtomic`, `writeManifest`, and `buildTraceNode`.
- Added manifest-first persistence: `status='in_progress'` before capability lookup/invocation, then `status='success'` or `status='error'` for missing capability and thrown-error paths.
- Added startup retention sweep with `parseRetentionHours(process.env.IMAGE_GEN_RUN_RETENTION_HOURS)`, `sweepRunArtifacts`, a retention summary log, and non-fatal catch/log behavior.
- Added integration tests for success, missing capability, capability throw, retention sweep behavior, and trace contract snapshot.
- Added `06-HUMAN-UAT.md` for restart-based retention verification.

## Task Commits

1. **Task 1: Wire runs module into image_op handler + main() sweep + import-safety guard + registry.unregister** - `9b8cd16` (feat)
2. **Task 2: Integration tests + trace snapshot + manual UAT script** - `85affcf` (test)

## Files Created/Modified

- `src/index.ts` - Exported `createServer`, added `handleImageOp`, run artifact/manifest writes, trace runId/artifactPath/outcome/timing fields, startup retention sweep, and direct invocation guard.
- `src/capabilities/registry.ts` - Added `unregister(op, provider)` for test isolation.
- `src/runs/retention.ts` - Corrected `retentionHours=0` to delete all eligible run dirs.
- `tests/integration/image_op.runs.test.ts` - Covers success artifact/manifest/user-facing output, missing capability errors, thrown capability errors, and sweep deletion.
- `tests/integration/image_op.trace.test.ts` - Locks trace node key shape and redacts volatile fields for snapshot stability.
- `tests/integration/__snapshots__/image_op.trace.test.ts.snap` - Stores the redacted single-node trace snapshot.
- `.planning/phases/06-run-session-artifact-layer/06-HUMAN-UAT.md` - Documents manual restart-based retention verification for `IMAGE_GEN_RUN_RETENTION_HOURS=1`, default 24h, and invalid env fallback.

## Decisions Made

- Used the existing runs module as the sole owner of run ID, run directory, artifact path, manifest, and trace node construction.
- Preserved v1.0 tools unchanged; only `image_op` receives run artifact behavior.
- Preserved `latencyMs` while adding `startedAtMs`, `endedAtMs`, `durationMs`, `outcome`, and `artifactPath`.
- Treated `retentionHours=0` as explicit delete-all semantics, matching the Phase 6 research and integration expectation.

## Verification

- `npm run build` - passed
- `npx vitest run tests/integration/image_op.trace.test.ts -u` - passed, wrote 1 snapshot
- `npx vitest run tests/integration --reporter=verbose` - passed, 2 files / 7 tests
- `npx vitest run --reporter=verbose` - passed, 6 files / 31 tests
- `npm test` - passed, 6 files / 31 tests
- `timeout 5 node -e "import('./dist/index.js').then(m => { if (typeof m.handleImageOp !== 'function') process.exit(1); if (typeof m.createServer !== 'function') process.exit(1); }).catch(() => process.exit(1))"` - passed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected retentionHours=0 behavior for just-created runs**
- **Found during:** Task 2 (Integration tests + trace snapshot + manual UAT script)
- **Issue:** `sweepRunArtifacts(0)` could skip a newly created run because its directory mtime was equal to or newer than the cutoff timestamp.
- **Fix:** Changed retention sweep comparison so retention `0` bypasses the age check and deletes every eligible non-symlink `run-*` directory.
- **Files modified:** `src/runs/retention.ts`
- **Verification:** `npx vitest run tests/integration --reporter=verbose`, `npm test`
- **Committed in:** `85affcf`

---

**Total deviations:** 1 auto-fixed (Rule 1 bug)
**Impact on plan:** The fix aligns 06-01 retention semantics with the 06-02 integration requirement and the Phase 6 research note that retention `0` deletes all runs.

## Issues Encountered

- The integration suite initially failed on the `sweepRunArtifacts(0)` case; resolved with the targeted retention age-check fix documented above.

## User Setup Required

Manual retention-on-restart UAT is documented in `.planning/phases/06-run-session-artifact-layer/06-HUMAN-UAT.md`. No external service configuration is required.

## Known Stubs

None.

## Next Phase Readiness

Phase 6 run artifacts are now wired end-to-end for `image_op`. Phase 7 can use `.runs/<runId>/` artifacts for eval outputs, and Phase 9 can reuse the same trace node shape for multi-node DAG execution.

## Self-Check: PASSED

- Found `src/index.ts`
- Found `tests/integration/image_op.runs.test.ts`
- Found `tests/integration/image_op.trace.test.ts`
- Found `tests/integration/__snapshots__/image_op.trace.test.ts.snap`
- Found `.planning/phases/06-run-session-artifact-layer/06-HUMAN-UAT.md`
- Found commits `9b8cd16` and `85affcf`

---
*Phase: 06-run-session-artifact-layer*
*Completed: 2026-05-02*
