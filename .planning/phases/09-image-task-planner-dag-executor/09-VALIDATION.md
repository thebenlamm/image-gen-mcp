---
phase: 09-image-task-planner-dag-executor
slug: image-task-planner-dag-executor
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-04
updated: 2026-05-04
---

# Phase 09 - Validation Strategy

Per-phase validation contract for Nyquist coverage after execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.9 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- tests/task/plan-schema.test.ts tests/task/planner.test.ts tests/task/plan-validator.test.ts tests/task/ref-resolver.test.ts tests/task/dag-executor.test.ts tests/task/best-partial.test.ts tests/task/serialize-response.test.ts tests/integration/image_task.e2e.test.ts tests/integration/image_task.dry-run.test.ts tests/integration/image_task.failure.test.ts tests/utils/path-input-root.test.ts` |
| Full suite command | `npm test` |
| Build command | `npm run build` |

## Requirement-to-Task Map

| Requirement | Task Surface | Automated Coverage | Status |
|-------------|--------------|--------------------|--------|
| TASK-01: `image_task` tool | `src/index.ts` | `tests/integration/image_task.e2e.test.ts` | COVERED |
| TASK-02: constraints schema | `src/index.ts`, `src/task/plan-schema.ts` | `tests/task/plan-schema.test.ts`, `tests/task/plan-validator.test.ts` | COVERED |
| TASK-03: planner output validation | `src/task/planner.ts`, `src/task/plan-validator.ts` | `tests/task/planner.test.ts`, `tests/task/plan-validator.test.ts` | COVERED |
| TASK-04: dry-run validated plan only | `src/index.ts`, `src/task/plan-validator.ts` | `tests/integration/image_task.e2e.test.ts`, `tests/integration/image_task.dry-run.test.ts` | COVERED |
| TASK-05: budget cap hard fail before providers | `src/task/plan-validator.ts` | `tests/integration/image_task.e2e.test.ts` | COVERED |
| TASK-06: independent-node parallelism | Phase 10 executor extension | `tests/task/dag-executor.test.ts`, `tests/integration/image_task.parallelism.test.ts` | COVERED BY PHASE 10 |
| TASK-07: failure trace and best partial | `src/task/dag-executor.ts`, `src/task/best-partial.ts` | `tests/integration/image_task.failure.test.ts`, `tests/task/best-partial.test.ts` | COVERED |
| TASK-08: response totals and paths | `src/task/serialize-response.ts` | `tests/task/serialize-response.test.ts`, `tests/integration/image_task.e2e.test.ts` | COVERED |
| TASK-09: no base64/Buffers in response | `src/task/serialize-response.ts` | `tests/task/serialize-response.test.ts` | COVERED |
| TASK-10: `revisedPrompt` in trace | `src/task/dag-executor.ts`, `src/task/serialize-response.ts` | `tests/integration/image_task.e2e.test.ts` | COVERED |

## Cross-Reference Audit

Phase 9 verification passed after validator gap closure. TASK-06 was intentionally deferred in Phase 9 and is now covered by Phase 10 bounded executor parallelism, so the milestone-level requirement has no remaining gap.

## Validation Audit 2026-05-04

| Metric | Count |
|--------|-------|
| Requirements audited | 10 |
| Gaps found | 0 |
| Resolved by new tests | 0 |
| Existing automated coverage | 10 |
| Escalated | 0 |

## Verification Results

| Command | Result |
|---------|--------|
| Targeted image_task debt suite | PASS |
| `npm run build` | PASS |

## Validation Sign-Off

- [x] All task requirements have automated coverage or milestone-level Phase 10 coverage.
- [x] Early terminal manifest regressions are now covered by integration tests.
- [x] `nyquist_compliant: true` set in frontmatter.

Approval: approved 2026-05-04
