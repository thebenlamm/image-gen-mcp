---
phase: 06-run-session-artifact-layer
reviewed: 2026-05-02T00:21:52Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - package.json
  - src/capabilities/registry.ts
  - src/index.ts
  - src/runs/dir.ts
  - src/runs/id.ts
  - src/runs/index.ts
  - src/runs/manifest.ts
  - src/runs/retention.ts
  - src/runs/trace.ts
  - src/runs/write.ts
  - tests/helpers/tmpOutputDir.ts
  - tests/integration/__snapshots__/image_op.trace.test.ts.snap
  - tests/integration/image_op.runs.test.ts
  - tests/integration/image_op.trace.test.ts
  - tests/runs/dir.test.ts
  - tests/runs/id.test.ts
  - tests/runs/retention.test.ts
  - tests/runs/write.test.ts
  - vitest.config.ts
findings:
  critical: 1
  warning: 2
  info: 0
  total: 3
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-05-02T00:21:52Z
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

Reviewed the Phase 6 run artifact layer, image_op integration path, retention sweep, manifest/trace helpers, and related tests. The main issue is that retention cleanup deletes any directory with a `run-` prefix under `.runs`, not only directories created by this implementation's strict run ID format. There are also robustness gaps around manifest write failures and a contract test that does not enforce the invariant it names.

Verification run during review: `npm test` passed, and `npm run build` passed.

## Critical Issues

### CR-01: Retention Sweep Can Delete Non-Run Directories

**Severity:** BLOCKER
**File:** `src/runs/retention.ts:62`
**Issue:** The sweeper accepts any directory whose name starts with `run-` and then recursively removes it when old enough or when retention is `0`. Run IDs are generated and validated with a much stricter format, so a user or another tool placing `run-important`, `run-backup`, or similar under `<outputDir>/.runs` can lose data on server startup.
**Fix:**
```ts
import { isValidRunId, resolveRunsRoot } from './dir.js';

// ...
if (!isValidRunId(entry.name)) {
  result.skipped += 1;
  continue;
}
```
Only delete directories that match the exact `RUN_ID_REGEX` used by `createRunId()`.

## Warnings

### WR-01: Manifest Write Failures Escape the Tool Handler

**Severity:** WARNING
**File:** `src/index.ts:499`
**Issue:** The initial `writeManifest()` runs outside the main operation `try` block. If the run directory can be created but the manifest write fails, for example due to permissions, quota, or an interrupted filesystem write, `handleImageOp()` rejects instead of returning the normal JSON error response. The missing-capability branch has the same shape at the later manifest write.
**Fix:** Wrap manifest initialization/finalization failures and return a structured tool response. At minimum, put the initial manifest write in a guarded block:
```ts
try {
  await writeManifest(runDir, initialManifest);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        success: false,
        error: `Failed to write run manifest: ${message}`,
        runId,
        trace: { runId, nodes: [] },
      }),
    }],
  };
}
```

### WR-02: Multi-Node Trace Contract Test Allows Divergent Shapes

**Severity:** WARNING
**File:** `tests/integration/image_op.trace.test.ts:113`
**Issue:** The test is named as enforcing an identical node-key shape, but it passes when the synthesized trace has up to two different key sets. Because `JSON.stringify` drops `undefined` fields, regressions where intermediate and final nodes expose different keys will pass this test, weakening the Phase 9 trace contract coverage.
**Fix:** Normalize optional fields before comparing, or assert one exact key set:
```ts
const allKeys = roundTripped.nodes.map((n: any) => Object.keys(n).sort().join(','));
expect(new Set(allKeys).size).toBe(1);
```
If the intended contract allows intermediate nodes to omit `output`, rename the test and assert the two allowed shapes explicitly.

---

_Reviewed: 2026-05-02T00:21:52Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
