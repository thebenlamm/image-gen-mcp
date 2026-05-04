---
phase: 11-provider-breadth-post-eval
verified: 2026-05-03T23:16:43Z
status: passed
score: 19/19 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 15/19
  gaps_closed:
    - "Photoroom composite_layers no longer requires top-level params.input and can pass shared validation with params.canvas + params.layers[]."
    - "Photoroom composite_layers rejects multi-layer and placement-field calls before network execution instead of silently dropping unsupported semantics."
    - "Photoroom composite eval case no longer supplies orphan params.input and now scores the adapter's actual single-subject shadow path with alpha_coverage."
    - "runEval rejects eval cases whose params.input contradicts a resolved capability declaring requiresInputImage=false before invocation/scoring."
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Run live Phase 11 provider evals with PHOTOROOM_API_KEY, FAL_KEY, and IDEOGRAM_API_KEY set."
    expected: "npm run eval exits 0 and produces scored results for extract_subject:photoroom, composite_layers:photoroom, edit_prompt:fal, and generate:ideogram; list_capabilities then shows non-empty quality.scores for all four."
    why_human: "External provider credentials and live API behavior are required; automated tests use mocked providers or synthetic eval results."
  - test: "Run a best-tier product-photography image_task with a real product image."
    expected: "Trace shows composite_layers provider=photoroom with metadata.api='image-editing', metadata.shadowApplied=true, metadata.qualityMeasured=true, and non-empty metadata.qualityScores."
    why_human: "The final product-photography route depends on live eval scores plus LLM planner behavior against the scored registry."
  - test: "Run a fast-tier Replicate-class/edit task after live evals."
    expected: "Trace selects edit_prompt:fal when fal.ai's measured latency/cost edge wins above the quality floor, with quality metadata visible."
    why_human: "Requires live fal.ai timing/results and planner route selection; no live credentials are available to this verifier."
  - test: "Run a text-heavy generation task after live evals."
    expected: "Trace selects generate:ideogram for text-heavy generation and exposes ocr_text_presence quality scores."
    why_human: "Ideogram live generation and OCR-scored eval output are external-service dependent."
human_verification_status: completed
human_verification_artifact: 11-HUMAN-UAT.md
---

# Phase 11: Provider Breadth (Post-Eval) Verification Report

**Phase Goal:** Users can route through Photoroom, fal.ai, Flux Kontext, and Ideogram for capabilities where they measurably outperform existing providers
**Verified:** 2026-05-03T23:16:43Z
**Status:** passed
**Re-verification:** Yes - after gap closure and review fixes

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Product-photography `image_task` best-tier can route to Photoroom with trace evidence | VERIFIED automated; HUMAN live route | `src/capabilities/photoroom-composite-layers.ts:146-149` sets `requiresInputImage:false` and `supportsMultipleInputs:false`; `src/capabilities/validation.ts:66-76` validates the documented single-layer contract; `README.md:608-615` documents the live route check. |
| 2 | Fast-tier Replicate-class route can select a fal.ai mirror when measured cost/latency wins | VERIFIED automated; HUMAN live route | `src/capabilities/fal-edit-prompt.ts:133-225` implements `edit_prompt:fal`; eval cases exist in `eval/cases/fal-flux-kontext.json`; planner prompt exposes quality/cost/latency policy at `src/task/planner.ts:73-80`. |
| 3 | Flux Kontext is registered for `edit_prompt` and selectable when measured edit score exceeds OpenAI | VERIFIED automated; HUMAN live route | Registration in `src/capabilities/register.ts:44-47`; synthetic score application coverage in `tests/eval/apply-results.test.ts:172-205`. |
| 4 | Ideogram is registered for `generate` with measured text-fidelity scoring for text-heavy goals | VERIFIED automated; HUMAN live route | `generate` is in `src/capabilities/types.ts:1-10`, `src/task/plan-schema.ts:17-27`, and `src/index.ts:452-458`; Ideogram uses documented `1x1`, `16x9`, `9x16` aspect ratios in `src/capabilities/ideogram-generate.ts:9-13`; OCR eval cases exist in `eval/cases/ideogram.json`. |
| 5 | Each new provider has at least one valid eval case before quality scores are populated | VERIFIED | Photoroom, fal, and Ideogram cases exist with `requiredEnv`; `src/eval/run.ts:103-125` blocks mismatched cases before invocation; `src/eval/apply-results.ts:51-77` only applies scored results by `(op, provider, modelVersion)`. |
| 6 | Photoroom extract_subject is capability-only, API-key gated, and guarded as an unscored second provider | VERIFIED | Factory returns null without `PHOTOROOM_API_KEY` in `src/capabilities/photoroom-extract-subject.ts:27-31`; registration uses `allowUnscoredProduction` in `src/capabilities/register.ts:34-37`. |
| 7 | Photoroom composite_layers is capability-only, API-key gated, and delivers the shadow/relighting path | VERIFIED | Adapter posts to Image Editing API at `src/capabilities/photoroom-composite-layers.ts:9`; `shadow.mode` is sent when enabled at lines `171-173`; metadata includes `api` and `shadowApplied` at lines `213-218`. |
| 8 | fal registers through `allowUnscoredProduction` without loosening the registry gate | VERIFIED | fal registration uses the explicit gate at `src/capabilities/register.ts:44-47`; registry guard remains covered by `tests/capabilities/registry-quality.test.ts`. |
| 9 | Ideogram sole-provider `generate` registration does not require unscored second-provider override | VERIFIED | `src/capabilities/register.ts:49-52` registers Ideogram without `allowUnscoredProduction`; registry only requires the override for second providers. |
| 10 | `generate` validation is wired through capability, plan, eval, and image_op surfaces | VERIFIED | Verified in `src/capabilities/validation.ts:25-29`, `src/task/plan-schema.ts:17-27`, `src/task/plan-validator.ts:45-55`, `src/eval/cases.ts`, and `src/index.ts:452-458`. |
| 11 | New provider invoke returns expose provider/modelVersion metadata | VERIFIED | Photoroom extract lines `97-103`, Photoroom composite lines `213-218`, fal lines `216-222`, Ideogram lines `146-152`. |
| 12 | Phase 11 eval cases use deterministic scorers only | VERIFIED | Photoroom uses `alpha_coverage`/`pixel_delta`, fal uses `pixel_delta`/`ocr_text_presence`, Ideogram uses `ocr_text_presence`; no human scorer in `eval/cases/*.json`. |
| 13 | fal cases mirror OpenAI fixtures/prompts for head-to-head comparison | VERIFIED | `eval/cases/fal-flux-kontext.json` mirrors the OpenAI edit prompts and fixtures for product color and SALE 50 text edits. |
| 14 | Trace enriches every resolved route with qualityMeasured and optional quality fields | VERIFIED | `computeRoutingTransparency` in `src/task/dag-executor.ts:157-177`; merged into success/error traces at lines `212` and `227-328`. |
| 15 | Serialized response preserves trace metadata | VERIFIED | `src/task/serialize-response.ts:102-130` copies `traceNode.metadata` into serialized trace nodes. |
| 16 | Provider failure does not silently fallback | VERIFIED | `executeDag` resolves one planned capability at `src/task/dag-executor.ts:312-336`; test coverage asserts no alternate provider invocation in `tests/task/dag-executor.test.ts`. |
| 17 | `applyEvalResultsToRegistry` populates scores by op/provider/modelVersion, including new providers | VERIFIED | `src/eval/apply-results.ts:51-77`; Phase 11 synthetic result test verifies all four providers in `tests/eval/apply-results.test.ts:146-209`. |
| 18 | Code review findings do not block phase goal | VERIFIED with warnings | Current `11-REVIEW.md` has 0 critical and 3 warnings. WR-01/WR-02/WR-03 are robustness/contract warnings, not observed blockers for the verified Phase 11 route surfaces. |
| 19 | Automated test/build baseline is green | VERIFIED | I ran `npm run build` and targeted Vitest suites: 4 files, 47 tests passed. Orchestrator also reports `npm test` passed: 48 files, 298 tests, 0 failed, and schema drift `drift_detected=false`. |

**Score:** 19/19 truths verified automatically; live provider UAT completed in `11-HUMAN-UAT.md`.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/capabilities/photoroom-extract-subject.ts` | Photoroom Remove Background `extract_subject` | VERIFIED | Substantive, API-key gated, registered, returns provider/modelVersion metadata. |
| `src/capabilities/photoroom-composite-layers.ts` | Photoroom Image Editing `composite_layers` with shadow | VERIFIED | Single-subject contract, no top-level input requirement, rejects multi-layer and placement fields, no `imageGenMcp.layers` field. |
| `src/capabilities/fal-edit-prompt.ts` | fal Flux Kontext `edit_prompt` | VERIFIED | Substantive adapter and registration. Review warning remains: poll/result fetches lack per-request abort. |
| `src/capabilities/ideogram-generate.ts` | Ideogram `generate` | VERIFIED | Substantive adapter and registration; aspect ratios are documented `1x1`, `16x9`, `9x16`. Review warning remains: initial generate POST lacks timeout. |
| `eval/cases/photoroom.json` | Photoroom extract + composite eval coverage | VERIFIED | Composite case has no `params.input`, uses one layer with `shadow.enabled`, and scores `alpha_coverage`. |
| `eval/cases/fal-flux-kontext.json` | fal eval cases | VERIFIED | Two cases with deterministic scorers and `FAL_KEY` gate. |
| `eval/cases/ideogram.json` | Ideogram text-fidelity eval cases | VERIFIED | Two `generate` cases use OCR text presence and `IDEOGRAM_API_KEY` gate. |
| `src/eval/run.ts` | Eval case execution and contract lint | VERIFIED | Rejects params/input mismatches before invocation/scoring. |
| `src/task/dag-executor.ts` | Trace routing metadata | VERIFIED | Computes and emits quality metadata from the resolved registry. |
| `README.md` | Provider breadth and live verification docs | VERIFIED | Documents single-subject Photoroom contract and live eval/image_task checks. |

`gsd-sdk verify.artifacts` reported one pattern miss because 11-03 PLAN listed `invalid-composite-case` under `tests/eval/apply-results.test.ts`; the regression exists in `tests/eval/run.test.ts:280-331`, matching the PLAN truth's "apply-results or run.test" wording. This is not a gap.

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `src/capabilities/register.ts` | New provider factories | Factory invocation + registry.register | VERIFIED | Imports/invokes Photoroom, fal, and Ideogram factories at lines `8-11` and `34-52`. |
| `src/capabilities/validation.ts` | Photoroom composite contract | `requiresInputImage:false`, single-layer and placement rejection | VERIFIED | `validateCapabilityParams` accepts no top-level input and rejects unsupported placement fields for single-input providers. |
| `eval/cases/photoroom.json` | Photoroom composite adapter | Case params match consumed shape | VERIFIED | Case supplies `canvas`, exactly one `layers[0].input`, and `shadow.enabled`; adapter consumes those fields. |
| `src/eval/run.ts` | Registry quality population | Contract lint before invoke, then apply results | VERIFIED | Invalid cases become `status:'error'`; `applyEvalResultsToRegistry` only runs after successful eval with scored cases. |
| `src/task/dag-executor.ts` | Response trace | `qualityMeasured`, `qualityScores`, `noIncumbentComparison`, `qualityUnavailable` | VERIFIED | Trace metadata is computed from registry and serialized unchanged. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `src/eval/apply-results.ts` | `quality.scores` | Scored eval result entries matched by op/provider/modelVersion | Yes, for valid scored eval entries | VERIFIED |
| `src/eval/run.ts` | Photoroom composite score input | `eval/cases/photoroom.json` plus live adapter output | Yes after live eval; automated guard prevents invalid semantic scoring | VERIFIED automated; HUMAN live data |
| `src/task/dag-executor.ts` | `trace.nodes[].metadata.qualityScores` | Resolved capability registry quality | Yes when registry has eval-populated scores | VERIFIED |
| `src/task/planner.ts` | Capability snapshot quality | `registry.list()` serialized into system prompt | Yes | VERIFIED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Build | `npm run build` | Exit 0 | PASS |
| Targeted Phase 11 regressions | `npx vitest run tests/capabilities/photoroom-composite-layers.test.ts tests/eval/run.test.ts tests/eval/apply-results.test.ts tests/task/dag-executor.test.ts` | 4 files, 47 tests passed | PASS |
| Full test suite | `npm test` | Orchestrator reports 48 files, 298 tests, 0 failed | PASS |
| Schema drift | schema drift check | Orchestrator reports `drift_detected=false` | PASS |
| Live provider evals | `npm run eval` with real provider keys | Passed; see `11-HUMAN-UAT.md` | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| PROV-01 | 11-01, 11-02, 11-03 | Photoroom registered for `extract_subject` and `composite_layers` product photography | VERIFIED | Both adapters are implemented/registered; composite shadow route and valid eval case are aligned. Live route UAT passed in `11-HUMAN-UAT.md`. |
| PROV-02 | 11-01, 11-02 | fal.ai registered as faster/cheaper mirror for Replicate-class capabilities | VERIFIED | `edit_prompt:fal`, eval coverage, score application, and trace transparency exist. Live route UAT passed in `11-HUMAN-UAT.md`. |
| PROV-03 | 11-01, 11-02 | Flux Kontext registered for `edit_prompt` | VERIFIED | fal adapter uses `fal-ai/flux-pro/kontext` and is registered as `edit_prompt:fal`; live route UAT passed in `11-HUMAN-UAT.md`. |
| PROV-04 | 11-01, 11-02 | Ideogram registered for `generate` with measured text-fidelity score | VERIFIED | `generate:ideogram`, OCR eval cases, score application, and live route UAT passed in `11-HUMAN-UAT.md`. |
| PROV-05 | 11-02, 11-03 | Each new provider has at least one eval case before `quality.score` is populated | VERIFIED | Valid eval cases exist, run-time contract lint prevents invalid score population, and live eval UAT passed in `11-HUMAN-UAT.md`. |

No orphaned Phase 11 requirements were found beyond PROV-01 through PROV-05 in `.planning/REQUIREMENTS.md`.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---:|---|---|---|
| `src/capabilities/photoroom-composite-layers.ts` | 174 | Ignores canonical `canvas.background` while accepting it in shared shape | WARNING | Current review WR-01. A plan using `canvas.background` may get default/transparent provider output unless it uses `params.background.color`. Does not block the verified single-subject shadow path. |
| `src/capabilities/ideogram-generate.ts` | 122 | Initial provider POST has no timeout | WARNING | Current review WR-02. A stalled request can hang live calls. |
| `src/capabilities/fal-edit-prompt.ts` | 90 | fal status/result fetches have no per-request timeout | WARNING | Current review WR-02. Poll loop timeout does not cover a stuck individual fetch. |
| `src/capabilities/photoroom-composite-layers.ts` | 105 | Non-object layer entries can throw raw TypeError | WARNING | Current review WR-03. Malformed callers get inconsistent errors; existing valid route is unaffected. |
| `src/capabilities/validation.ts` | 82 | Non-object layer entries can throw raw TypeError | WARNING | Current review WR-03. Should be hardened in follow-up. |

### Human Verification Completed

#### 1. Live Phase 11 Provider Evals

**Test:** Set `PHOTOROOM_API_KEY`, `FAL_KEY`, and `IDEOGRAM_API_KEY`, then run `npm run eval`.
**Expected:** Results include scored entries for `extract_subject:photoroom`, `composite_layers:photoroom`, `edit_prompt:fal`, and `generate:ideogram`; `list_capabilities` shows quality scores for all four.
**Result:** Passed; see `11-HUMAN-UAT.md`.

#### 2. Product-Photography Best-Tier Routing

**Test:** Call `image_task` with `{ goal: "product photo on a clean white surface with soft shadow", input_images: ["/path/to/product.jpg"], constraints: { quality_tier: "best" } }` after live evals.
**Expected:** Trace shows `composite_layers` selected with `provider=photoroom`, `metadata.api="image-editing"`, `metadata.shadowApplied=true`, `metadata.qualityMeasured=true`, and non-empty `metadata.qualityScores`.
**Result:** Passed; see `11-HUMAN-UAT.md`.

#### 3. fal.ai Fast-Tier Routing

**Test:** Run a fast-tier edit task matching the Replicate-class/Flux Kontext route after live evals.
**Expected:** Trace selects `edit_prompt:fal` when fal.ai's measured latency/cost wins above the quality floor.
**Result:** Passed; see `11-HUMAN-UAT.md`.

#### 4. Ideogram Text-Heavy Routing

**Test:** Run a text-heavy generation task after live evals.
**Expected:** Trace selects `generate:ideogram` and surfaces `ocr_text_presence` in `metadata.qualityScores`.
**Result:** Passed; see `11-HUMAN-UAT.md`.

### Gaps Summary

No automated blockers remain. The previous Photoroom composite gaps are closed in code and tests. Credential-backed evals plus route UAT are complete in `11-HUMAN-UAT.md`.

---

_Verified: 2026-05-03T23:16:43Z_
_Verifier: the agent (gsd-verifier)_
