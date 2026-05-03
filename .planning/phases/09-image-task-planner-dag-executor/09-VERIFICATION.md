---
phase: 09-image-task-planner-dag-executor
verified: 2026-05-03T16:35:10Z
status: gaps_found
score: 7/10 must-haves verified
overrides_applied: 0
gaps:
  - truth: "TASK-03: Planner emits a JSON Plan validated against the capability registry"
    status: failed
    reason: "validatePlan accepts invalid execution contracts: node output refs do not have to be represented in dependsOn, and op/outputKind mismatches are trusted from the planner."
    artifacts:
      - path: "src/task/plan-validator.ts"
        issue: "Lines 222-241 validate node refs exist but do not require node.dependsOn to include the referenced node."
      - path: "src/task/plan-validator.ts"
        issue: "Lines 291-314 check terminal.outputKind only, without verifying outputKind matches the registered capability operation."
    missing:
      - "Reject $nodes.X.output references unless the current node declares X in dependsOn."
      - "Validate operation outputKind against expected image/data kind for each capability op before accepting terminal image plans."
      - "Add regression tests for PLAN_MISSING_DEP and PLAN_OUTPUT_KIND_MISMATCH."
  - truth: "TASK-04: dry_run returns a validated Plan without executing provider calls"
    status: failed
    reason: "dry_run depends solely on validatePlan, but validatePlan skips IMAGE_GEN_INPUT_ROOT checks for $inputs.* references; a dry run can report a valid plan for input_images outside the configured root."
    artifacts:
      - path: "src/task/plan-validator.ts"
        issue: "Lines 351-354 skip assertWithinInputRoot whenever the path field is a PlanRefSchema value."
      - path: "src/index.ts"
        issue: "Lines 997-998 return dryRunResponse immediately after validation, so capability-level path checks never run."
    missing:
      - "Validate ctx.inputImages values with assertWithinInputRoot during plan validation."
      - "Add a dry-run regression test where IMAGE_GEN_INPUT_ROOT is set and input_images points outside it."
deferred:
  - truth: "TASK-06: DAG executor walks the plan; independent nodes run concurrently (libvips concurrency capped at 2)"
    addressed_in: "Phase 10"
    evidence: "Phase 10 success criterion #5: executing a multi-node DAG with two independent extract operations runs them concurrently with sharp/libvips concurrency capped at 2."
human_verification: []
---

# Phase 9: image_task Planner + DAG Executor Verification Report

**Phase Goal:** Users can hand off a natural-language goal and receive a final image plus a structured trace, with the MCP planning and executing the DAG internally  
**Verified:** 2026-05-03T16:35:10Z  
**Status:** gaps_found  
**Re-verification:** No - initial verification

## Goal Achievement

Phase 9 is substantially implemented, but the phase goal is not fully achieved. The `image_task` tool, planner wrapper, executor, serializer, traces, manifests, tests, and docs exist and are wired. The blocker is that "validated Plan" is not true enough: the validator accepts plans that can fail during execution or pass dry-run safety despite violating input-root policy.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `image_task` is registered and accepts `{goal, input_images?, constraints?, dry_run?, runId?, seed?, outputDir?, outputPath?}` | VERIFIED | `src/index.ts:470-490` registers `image_task` with the expected schema. |
| 2 | Constraints include output size/format, quality tier, budget cap, latency cap, and style refs | VERIFIED | `src/index.ts:476-483`; README documents the same shape at `README.md:488-496`. |
| 3 | Planner uses Anthropic Haiku structured output and PlanSchema | VERIFIED | `src/task/planner.ts:166-182` constructs Anthropic with `ANTHROPIC_API_KEY`, model `claude-haiku-4-5`, `messages.parse`, and `zodOutputFormat(PlanSchema)`. |
| 4 | Planner output is validated against registry and execution contract | FAILED | Registry/capability checks exist, but validator accepts missing node dependencies for `$nodes.*.output` and trusts planner-supplied `outputKind`; review CR-01/CR-02 reproduced in code. |
| 5 | `dry_run: true` returns a validated plan without provider invocation | FAILED | Provider invocation is skipped, but validation skips `IMAGE_GEN_INPUT_ROOT` for `$inputs.*`; dry run can return success for unsafe input paths. |
| 6 | `budget_cap_usd` hard-fails at plan time before provider calls | VERIFIED | `validatePlan` returns `BUDGET_CAP_EXCEEDED` with cost/cap fields at `src/task/plan-validator.ts:389-404`; e2e test covers no provider call. |
| 7 | Executor walks DAG, retries once, skips downstream failures, and returns best partial | VERIFIED | `src/task/dag-executor.ts:228-354`; retry logic at `143-192`, skip logic at `194-226`, best partial at `353`. |
| 8 | Response includes output path, runId, trace, total cost, and total latency | VERIFIED | `serializeImageTaskResponse` projects these fields at `src/task/serialize-response.ts:143-183`; `handleImageTask` returns it at `src/index.ts:1056-1058`. |
| 9 | Trace/response are path-only and reject base64/Buffers | VERIFIED | Guard in `src/task/serialize-response.ts:53-82`; targeted tests cover data URLs, long base64 strings, Buffers, and nested values. |
| 10 | `revisedPrompt` surfaces in trace when present | VERIFIED | Executor sets `revisedPrompt` at `src/task/dag-executor.ts:172`; serializer preserves it at `src/task/serialize-response.ts:116`. |

**Score:** 7/10 truths verified

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Independent DAG nodes run concurrently with libvips concurrency capped at 2 | Phase 10 | Roadmap Phase 10 explicitly owns "Template Fast-Paths + Executor Parallelism" and success criterion #5 covers bounded concurrent execution. Current executor is sequential Kahn-order by design. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/task/plan-schema.ts` | Zod PlanSchema contract | VERIFIED | Exists; strict refs, 8 capability ops, node reason, cost/latency fields. |
| `src/task/planner.ts` | Anthropic Haiku planner wrapper | VERIFIED | Uses SDK, API key, structured output, PlanSchema defensive parse. |
| `src/task/plan-validator.ts` | 12-pass registry-aware validator | FAILED | Substantive and wired, but missing dependency/ref and op/outputKind validation; skips input-root check for `$inputs.*`. |
| `src/utils/path-input-root.ts` | Realpath input-root guard | VERIFIED | Exists and is wired into all 8 capability files plus literal path validation. |
| `src/task/ref-resolver.ts` | Recursive `$inputs` / `$nodes` resolver | VERIFIED | Resolves refs recursively and throws on unknown refs. |
| `src/task/best-partial.ts` | Best-partial selector | VERIFIED | BFS from terminal dependencies; only successful image outputs qualify. |
| `src/task/dag-executor.ts` | DAG executor | VERIFIED | Sequential Kahn-order executor with retry, skip, artifact writes, trace, totals, bestPartial. |
| `src/task/serialize-response.ts` | Compact path-only response serializer | VERIFIED | Projects compact plan/trace and runs final binary/base64 guard. |
| `src/index.ts` | MCP tool registration and orchestration | WARNING | Tool is registered and wired; early planner/validation/dry-run returns leave initial manifests `in_progress` per review WR-02. |
| Tests | Unit/integration coverage | WARNING | Existing tests pass, but no tests cover CR-01, CR-02, or CR-03. |

### Key Link Verification

| From | To | Status | Details |
|------|----|--------|---------|
| `src/index.ts` | planner, validator, executor, serializer | WIRED | Imports from `./task/index.js` and serializer at `src/index.ts:40-49`; handler calls planner, validator, executor, serializer. |
| `src/task/planner.ts` | `PlanSchema` | WIRED | `zodOutputFormat(PlanSchema)` at `src/task/planner.ts:181`, defensive `PlanSchema.parse` at `188`. |
| `src/task/plan-validator.ts` | capability registry | WIRED | Uses `ctx.registry.get` at `src/task/plan-validator.ts:319`, defaulting to `capabilityRegistry`. |
| `src/task/plan-validator.ts` | param validator | WIRED | Calls `validateCapabilityParams` at `src/task/plan-validator.ts:340`. |
| `src/task/plan-validator.ts` | input-root guard | PARTIAL | Literal paths are checked at `src/task/plan-validator.ts:351-370`; `$inputs.*` referenced values in `ctx.inputImages` are not checked. |
| `src/capabilities/*.ts` | input-root guard | WIRED | `assertWithinInputRoot` appears in all 8 input-reading capability implementations. |
| `src/task/dag-executor.ts` | ref resolver / best partial / trace / artifact writes | WIRED | Imports and calls `resolveRefs`, `selectBestPartial`, `buildTraceNode`, `nodeArtifactPath`, and `writeFileAtomic`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `handleImageTask` | `plan` | `planImageTask(...).plan` | Yes, from Anthropic structured output in production; tests mock planner | FLOWING |
| `validatePlan` | validation result | Plan + registry + constraints + inputImages | Partial; misses three invalid-plan cases | HOLLOW |
| `executeDag` | `nodeOutputs`, `trace`, `totals`, `bestPartial` | Capability registry invocations and artifact writes | Yes | FLOWING |
| `serializeImageTaskResponse` | MCP JSON response | `plan` + `ExecResult` | Yes, compact path-only projection | FLOWING |
| `dryRunResponse` | dry-run response | `Plan` after validation | Partial; depends on incomplete input-root validation | HOLLOW |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compiles | `npm run build` | Exit 0 | PASS |
| Targeted validator/e2e tests | `npm test -- --run tests/task/plan-validator.test.ts tests/integration/image_task.e2e.test.ts` | 2 files, 18 tests passed | PASS |
| Missing dependency for node ref should fail | One-off `node --input-type=module` call against `dist/task/plan-validator.js` | Returned `{ ok: true }` for `$nodes.a.output` with `dependsOn: []` | FAIL |
| op/outputKind mismatch should fail | One-off `node --input-type=module` call against `dist/task/plan-validator.js` | Returned `{ ok: true }` for `analyze_dimensions` declared as `outputKind: "image"` terminal | FAIL |
| input-root dry-run refs should fail | One-off `node --input-type=module` with `IMAGE_GEN_INPUT_ROOT` and outside `inputImages.product` | Returned `{ ok: true }` | FAIL |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TASK-01 | 09-01, 09-03 | User can call `image_task` with `{goal, input_images?, constraints?}` | SATISFIED | Tool registration and handler exist in `src/index.ts:470-490`, `939-1058`. |
| TASK-02 | 09-01 | `constraints` accepts output, quality, budget, latency, style refs | SATISFIED | Schema in `src/index.ts:476-483`; planner type in `src/task/planner.ts:37-44`. |
| TASK-03 | 09-01 | Planner emits JSON Plan validated against registry | BLOCKED | Planner emits schema output, but validation accepts invalid refs/dependencies and outputKind mismatch. |
| TASK-04 | 09-02 | `dry_run: true` returns Plan without executing | BLOCKED | No provider invocation is covered, but the returned plan can be invalid/unsafe because validation is incomplete. |
| TASK-05 | 09-01 | Budget cap enforced at plan time | SATISFIED | `BUDGET_CAP_EXCEEDED` branch and e2e no-provider-call coverage. |
| TASK-06 | 09-02 | Independent nodes run concurrently | DEFERRED | Current executor is sequential; Phase 10 explicitly owns bounded parallelism. |
| TASK-07 | 09-02 | Failure trace and best partial | SATISFIED | Executor skip/bestPartial logic and e2e failure test. |
| TASK-08 | 09-02, 09-03 | Response includes output/runId/trace/totals | SATISFIED | Serializer response contract and e2e success test. |
| TASK-09 | 09-03 | Trace returns paths only, never base64 | SATISFIED | Response guard and serializer/e2e tests. |
| TASK-10 | 09-01, 09-02, 09-03 | `revisedPrompt` surfaces in trace | SATISFIED | Executor and serializer preserve `revisedPrompt`; tests cover it. |

All requirement IDs named in phase PLAN frontmatter and the user request are accounted for: TASK-01 through TASK-10.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/task/plan-validator.ts` | 222-241 | Existing node refs checked for existence only | BLOCKER | Invalid DAG refs can validate and fail later in execution depending on node order. |
| `src/task/plan-validator.ts` | 303 | Trusts `outputKind` from planner | BLOCKER | Data-producing ops can be accepted as image terminal nodes. |
| `src/task/plan-validator.ts` | 351-354 | Skips path guard for `$inputs.*` | BLOCKER | Dry-run can approve input paths outside `IMAGE_GEN_INPUT_ROOT`. |
| `src/index.ts` | 982 | `seed` accepted but cast through `as never` | WARNING | Documented reproducibility input is ignored unless planner options later support it. |
| `src/index.ts` | 984-998 | Early returns after initial manifest | WARNING | Planner failure, validation failure, and dry-run leave manifest status `in_progress`. |

### Human Verification Required

None for this verification state. Automated verification already found blocking code-level gaps; human UAT should wait until the validator gaps are closed.

### Gaps Summary

The phase should not proceed as passed. The surface area exists and the happy-path behavior is covered, but the validator is currently too permissive for the phase contract. A planner can produce a plan that passes dry-run/validation and later fails in the executor, or a dry run can approve input paths that capability invocation would reject. Close the three validator gaps above, add regression tests, then re-run verification.

---

_Verified: 2026-05-03T16:35:10Z_  
_Verifier: the agent (gsd-verifier)_
