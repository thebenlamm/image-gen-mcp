---
phase: 06-run-session-artifact-layer
slug: run-session-artifact-layer
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-02
updated: 2026-05-02
---

# Phase 06 - Validation Strategy

Per-phase validation contract for Nyquist coverage after execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.9 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- --run tests/runs tests/integration/image_op.runs.test.ts tests/integration/image_op.trace.test.ts` |
| Full suite command | `npm test` |
| Build command | `npm run build` |
| Estimated runtime | ~2 seconds focused, ~2 seconds full on current workspace |

## Sampling Rate

- After every task commit: run the focused command for touched `tests/runs` or `tests/integration` files.
- After every plan wave: run `npm test`.
- Before `$gsd-verify-work`: run `npm run build` and `npm test`.
- Max feedback latency: ~2 seconds for focused Phase 6 coverage.

## Requirement-to-Task Map

| Requirement | Source Plan | Task Surface | Automated Coverage | Status |
|-------------|-------------|--------------|--------------------|--------|
| RUN-01: Each invocation generates a unique runId | 06-01 | `src/runs/id.ts`, `src/index.ts` | `tests/runs/id.test.ts`; `tests/integration/image_op.runs.test.ts` | COVERED |
| RUN-02: Intermediate artifacts saved under `.runs/<runId>/n<nodeId>.png` via atomic write | 06-01, 06-02 | `src/runs/dir.ts`, `src/runs/write.ts`, `src/index.ts` | `tests/runs/dir.test.ts`; `tests/runs/write.test.ts`; `tests/integration/image_op.runs.test.ts` | COVERED |
| RUN-03: `IMAGE_GEN_RUN_RETENTION_HOURS` controls cleanup with default 24 | 06-01 | `src/runs/retention.ts` | `tests/runs/retention.test.ts` | COVERED |
| RUN-04: Retention sweep runs at server startup and deletes old runs | 06-01, 06-02 | `src/runs/retention.ts`, `src/index.ts` | `tests/runs/retention.test.ts`; `tests/integration/image_op.runs.test.ts`; `06-HUMAN-UAT.md` restart script | COVERED |
| RUN-05: `image_op` returns runId so users can locate intermediates | 06-02 | `src/index.ts`, `src/runs/trace.ts`, `src/runs/manifest.ts` | `tests/integration/image_op.runs.test.ts`; `tests/integration/image_op.trace.test.ts` | COVERED |

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | RUN-01, RUN-02, RUN-04 | T-06-01, T-06-03, T-06-08 | Run IDs are strict-regex validated; run paths stay inside `.runs`; atomic writes use tmp plus rename. | unit | `npm test -- --run tests/runs` | yes | GREEN |
| 06-01-02 | 01 | 1 | RUN-03, RUN-04 | T-06-02, T-06-05, T-06-07 | Retention parser falls back safely; sweep skips symlinks and non-run siblings; `retentionHours=0` is explicit delete-all. | unit | `npm test -- --run tests/runs/retention.test.ts` | yes | GREEN |
| 06-02-01 | 02 | 2 | RUN-02, RUN-05 | T-06-09, T-06-11, T-06-15 | `image_op` writes manifest before invoke; success and error paths produce trace/runId; importing `src/index.ts` does not run the server. | integration | `npm test -- --run tests/integration/image_op.runs.test.ts tests/integration/image_op.trace.test.ts` | yes | GREEN |
| 06-02-02 | 02 | 2 | RUN-04, RUN-05 | T-06-12, T-06-13 | Startup sweep is non-fatal and occurs before transport connect; trace node shape remains Phase 9-compatible. | integration + manual UAT | `npm test -- --run tests/integration/image_op.runs.test.ts tests/integration/image_op.trace.test.ts` | yes | GREEN |

Status legend: COVERED/GREEN means the behavior has targeted automated verification and passes in the current workspace.

## Cross-Reference Audit

| Requirement | Existing Test File | Coverage Notes | Gap Status |
|-------------|--------------------|----------------|------------|
| RUN-01 | `tests/runs/id.test.ts`, `tests/integration/image_op.runs.test.ts` | Regex format, timestamp prefix stability, 1000 unique IDs, response `runId` format. | No gap |
| RUN-02 | `tests/runs/write.test.ts`, `tests/runs/dir.test.ts`, `tests/integration/image_op.runs.test.ts` | Atomic write success/failure cleanup, run root creation, traversal rejection, artifact file exists. | No gap |
| RUN-03 | `tests/runs/retention.test.ts` | Undefined, empty, valid, zero, fractional, garbage, negative, and `NaN` env values. | No gap |
| RUN-04 | `tests/runs/retention.test.ts`, `tests/integration/image_op.runs.test.ts`, `06-HUMAN-UAT.md` | Old/new deletion rules, non-run sibling preservation, symlink skip, missing `.runs`, `retentionHours=0`, direct sweep after image_op; restart lifecycle is manual. | No gap |
| RUN-05 | `tests/integration/image_op.runs.test.ts`, `tests/integration/image_op.trace.test.ts` | Success, missing capability, thrown capability, top-level runId, trace.runId, artifactPath, stable trace node key shape. | No gap |

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Restarting `node dist/index.js` runs retention before transport connect and logs the retention result. | RUN-04 | Process lifecycle and stdio transport startup are better verified as restart UAT than by instantiating MCP transport in unit tests. | Follow `.planning/phases/06-run-session-artifact-layer/06-HUMAN-UAT.md`. |

## Validation Audit 2026-05-02

| Metric | Count |
|--------|-------|
| Requirements audited | 5 |
| Gaps found | 0 |
| Resolved by new tests | 0 |
| Existing automated coverage | 5 |
| Manual-only restart checks | 1 |
| Escalated | 0 |

## Verification Results

| Command | Result |
|---------|--------|
| `npm test -- --run tests/runs tests/integration/image_op.runs.test.ts tests/integration/image_op.trace.test.ts` | PASS - 6 files, 31 tests |
| `npm run build` | PASS |

## Validation Sign-Off

- [x] All tasks have automated verification or documented manual restart UAT.
- [x] Sampling continuity: no 3 consecutive tasks without automated verification.
- [x] Wave 0 dependencies are satisfied by existing Vitest infrastructure.
- [x] No watch-mode flags are required for verification commands.
- [x] Feedback latency is under 5 seconds for focused Phase 6 validation.
- [x] `nyquist_compliant: true` set in frontmatter.

Approval: approved 2026-05-02
