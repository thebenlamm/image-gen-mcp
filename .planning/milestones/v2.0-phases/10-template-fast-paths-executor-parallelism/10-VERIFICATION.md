---
phase: 10-template-fast-paths-executor-parallelism
verified: 2026-05-03T19:30:58Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification: []
---

# Phase 10: Template Fast-Paths + Executor Parallelism Verification Report

**Phase Goal:** Common goal patterns skip the planner LLM entirely, and independent DAG nodes execute concurrently with bounded libvips usage
**Verified:** 2026-05-03T19:30:58Z
**Status:** passed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `image_task` with a goal matching an `ASSET_PRESETS` template executes without a Haiku call and reports `plannerMethod: 'template'` | VERIFIED | `src/index.ts:989-1006` calls `matchTemplate` before the planner branch and sets `plannerMethod = 'template'`; `src/index.ts:1009` calls `planImageTask` only in the `else` branch. `tests/integration/image_task.template.test.ts:73-82` verifies `profile_pic` succeeds without `ANTHROPIC_API_KEY` and does not surface `PLANNER_AUTH`. |
| 2 | New templates `product-on-white`, `logo-cleanup`, and `upscale-export` match their signatures and skip the planner | VERIFIED | `src/task/templates.ts:56-178` defines all three template builders and registry entries. `tests/task/templates.test.ts:74-125` verifies node shapes and `upscale-export` capability gating. Because these are returned from `matchTemplate`, the handler follows the template branch at `src/index.ts:1003-1006`. |
| 3 | `ASSET_PRESETS` fixes propagate to v2 templates without a forked copy | VERIFIED | `src/task/templates.ts:3` imports `ASSET_PRESETS`, `src/task/templates.ts:29-37` reads `preset.operations` directly into template plan params. `tests/task/templates.test.ts:141-154` mutates `ASSET_PRESETS.avatar.operations` and observes the next template plan reflect the mutation. |
| 4 | `constraints.budget_cap_usd: 0.005` either uses a template-only path or returns a hard error before the planner | VERIFIED | `src/task/budget-gate.ts:7-39` enforces threshold `0.01`; `src/index.ts:989-1001` runs template matching and budget gate before `planImageTask`. `tests/integration/image_task.budget.test.ts:66-92` verifies non-template sub-cent rejection with `BUDGET_CAP_REQUIRES_TEMPLATE` and template sub-cent success with `plannerMethod: 'template'`. |
| 5 | Independent DAG nodes execute concurrently with bounded sharp/libvips usage capped at 2 | VERIFIED | `src/task/sharp-config.ts:7-15` exports both caps as `2` and calls `sharp.concurrency(2)` once; `src/task/dag-executor.ts:14-15` imports the config; `src/task/dag-executor.ts:327-338` batches ready nodes with `MAX_PARALLEL_NODES` and `Promise.all`. `tests/task/dag-executor.test.ts:318-387` proves overlap and max in-flight cap of 2. A representative load check with two real 1600x1600 `extract_subject:@imgly/local` nodes completed successfully with `sharpConcurrency: 2`, `overlapMs: 3532`, and all nodes successful. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/task/templates.ts` | Template registry, `matchTemplate()`, ASSET_PRESETS-derived templates, 3 new templates | VERIFIED | Exists and substantive. Imports `ASSET_PRESETS` at line 3, uses `PlanSchema.safeParse` at line 195, defines explicit templates at lines 56-178, exported through `src/task/index.ts:9`. |
| `src/task/serialize-response.ts` | Top-level `plannerMethod` on serialized response | VERIFIED | Interface field at line 19, function arg at line 148, conditional response spread at line 158. `src/runs/trace.ts` has no `plannerMethod` matches. |
| `src/task/budget-gate.ts` | Named threshold and pre-planner gate | VERIFIED | Constant and gate are implemented at lines 7-39 and re-exported through `src/task/index.ts:2`. |
| `src/task/sharp-config.ts` | Module-load `sharp.concurrency(2)` and named cap exports | VERIFIED | Exports `SHARP_CONCURRENCY_LIMIT = 2`, `MAX_PARALLEL_NODES = 2`, and calls `sharp.concurrency(2)` at line 15. `rg "sharp\\.concurrency" src` finds only this file. |
| `src/task/dag-executor.ts` | Bounded ready-queue parallelism | VERIFIED | Imports config at lines 14-15 and drains batches with `Promise.all` capped by `MAX_PARALLEL_NODES` at lines 327-338. Trace nodes are emitted in plan order at lines 346-348, reflecting post-review commit `c2c782c`. |
| Tests | Unit and integration coverage for templates, budget gate, serialization, sharp config, executor parallelism | VERIFIED | Focused suite passed: 8 files, 63 tests. Build passed with `npm run build`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/task/templates.ts` | `src/utils/presets.ts` | Import and direct operations reference | WIRED | `src/task/templates.ts:3` imports `ASSET_PRESETS`; `src/task/templates.ts:36` assigns `operations: preset.operations`. SDK pattern check missed this due escaped pattern mismatch. |
| `src/task/templates.ts` | `src/task/plan-schema.ts` | Defensive schema parse | WIRED | `src/task/templates.ts:4` imports `PlanSchema`; `src/task/templates.ts:195-198` safe-parses before returning a match. |
| `src/task/index.ts` | `src/task/templates.ts` | Barrel export | WIRED | `src/task/index.ts:9` exports templates. |
| `src/index.ts` | `src/task/templates.ts` | `matchTemplate` before `planImageTask` | WIRED | `src/index.ts:989-1006` evaluates template match and handles template branch before `src/index.ts:1009-1013` invokes planner. SDK check missed this because the plan label included `(handleImageTask)`. |
| `src/index.ts` | `src/task/budget-gate.ts` | `checkBudgetGate` before `planImageTask` | WIRED | `src/index.ts:995-1001` checks budget gate before `src/index.ts:1009`. |
| `src/task/dag-executor.ts` | `src/task/sharp-config.ts` | Side-effect import and cap constant | WIRED | `src/task/dag-executor.ts:14-15` imports `MAX_PARALLEL_NODES` and side-effect config; `src/task/dag-executor.ts:329-338` uses it for bounded `Promise.all`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `src/task/templates.ts` | `plan.nodes[].params.operations` | `ASSET_PRESETS[assetType].operations` | Yes - by-reference source from `src/utils/presets.ts` | FLOWING |
| `src/index.ts` | `plannerMethod` | `templateMatch` branch or planner branch | Yes - passed into dry-run and final serializer | FLOWING |
| `src/index.ts` | budget gate result | `checkBudgetGate({ constraints, templateMatched })` | Yes - returns structured error or permits route | FLOWING |
| `src/task/dag-executor.ts` | ready node batch | Plan node dependencies and `MAX_PARALLEL_NODES` | Yes - dynamic ready queue drains in bounded batches | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Focused Phase 10 tests | `npm test -- --run tests/task/templates.test.ts tests/task/budget-gate.test.ts tests/task/dag-executor.test.ts tests/task/serialize-response.test.ts tests/task/sharp-config.test.ts tests/integration/image_task.template.test.ts tests/integration/image_task.budget.test.ts tests/integration/image_task.parallelism.test.ts` | 8 files passed, 63 tests passed | PASS |
| Type/build check | `npm run build` | `tsc` exited 0 | PASS |
| Trace remains free of `plannerMethod` | `rg -n "plannerMethod" src/runs/trace.ts || true` | no output | PASS |
| Sharp concurrency call centralized | `rg -n "sharp\\.concurrency" src` | only `src/task/sharp-config.ts:15` | PASS |
| Post-review fix commit included | `git show --stat --oneline c2c782c` | `c2c782c fix(10): address phase code review findings`, touching executor, serializer, templates, and tests | PASS |
| Realistic bounded-memory DAG load check | Generated two 1600x1600 PNG inputs, then ran two independent `extract_subject:@imgly/local` nodes plus a `composite_layers:sharp` terminal node through `executeDag` | `success: true`, `sharpConcurrency: 2`, `traceOrder: [nA,nB,nC]`, `outcomes: [success,success,success]`, `overlapMs: 3532`, `durationMs: 3655`, `rssBeforeMb: 126`, `rssAfterMb: 960`, `outputs: [A,B,C]` | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TMPL-01 | 10-01 | Template table imports existing `ASSET_PRESETS` by reference; fixes propagate | SATISFIED | `.planning/REQUIREMENTS.md:94`; `src/task/templates.ts:3,29-37`; mutation regression in `tests/task/templates.test.ts:141-154`. |
| TMPL-02 | 10-01 | Template matcher runs before planner LLM and skips Haiku on match | SATISFIED | `.planning/REQUIREMENTS.md:95`; `src/index.ts:989-1013`; integration test without Anthropic key at `tests/integration/image_task.template.test.ts:73-82`. |
| TMPL-03 | 10-01 | Add `product-on-white`, `logo-cleanup`, `upscale-export` templates | SATISFIED | `.planning/REQUIREMENTS.md:96`; implementations at `src/task/templates.ts:56-178`; unit coverage at `tests/task/templates.test.ts:74-125`. |
| TMPL-04 | 10-02 | Planner-skip enforced when budget cap is below `$0.01` | SATISFIED | `.planning/REQUIREMENTS.md:97`; `src/task/budget-gate.ts:7-39`; handler order at `src/index.ts:989-1009`; integration coverage at `tests/integration/image_task.budget.test.ts:66-92`. |

No orphaned Phase 10 requirement IDs found: `.planning/REQUIREMENTS.md:171` maps exactly `TMPL-01, TMPL-02, TMPL-03, TMPL-04` to Phase 10, and both plan frontmatters claim those IDs.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/task/templates.ts` | 20, 27, 58, 120, 144, 186, 189, 192, 196 | `return null` | INFO | Fail-closed template matching for missing inputs, unknown goals, missing capabilities, or invalid plans. Not a stub. |
| `src/task/templates.ts` | 98 | `operations: []` | INFO | Product-on-white final transform has no extra operations after composition. Tests verify the expected extract -> composite -> transform structure. Not hollow data. |

### Human Verification Required

None. The realistic-input bounded memory/OOM check was run locally with two generated 1600x1600 images and real `extract_subject:@imgly/local` capability execution.

### Gaps Summary

No blockers found. All roadmap success criteria and all plan must-haves are implemented and wired in the codebase, with focused tests, build, full regression tests, and realistic-image load verification passing.

---

_Verified: 2026-05-03T19:30:58Z_
_Verifier: the agent (gsd-verifier)_
