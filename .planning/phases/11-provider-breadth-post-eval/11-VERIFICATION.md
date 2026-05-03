---
phase: 11-provider-breadth-post-eval
verified: 2026-05-03T21:11:11Z
status: gaps_found
score: 15/19 must-haves verified
overrides_applied: 0
gaps:
  - truth: "`image_task` with `{goal: \"...\", constraints: {quality_tier: 'best'}}` for a product-photography goal routes to Photoroom (verifiable in trace)"
    status: failed
    reason: "The Photoroom composite_layers adapter is the planned product-photography/shadow path, but it does not implement the advertised composite contract: it requires top-level params.input through shared validation, uploads only layers[0].input, and ignores layer placement/opacity by sending them in a custom field the provider will not apply."
    artifacts:
      - path: "src/capabilities/photoroom-composite-layers.ts"
        issue: "constraints.requiresInputImage=true conflicts with README-documented params.canvas + params.layers[] contract; invoke reads only layers[0].input and sends imageGenMcp.layers rather than applying documented composition semantics."
      - path: "src/capabilities/validation.ts"
        issue: "requiresInputImage gate rejects documented composite_layers:photoroom calls that omit params.input."
    missing:
      - "Align Photoroom composite_layers capability constraints and invocation with the supported production contract."
      - "Either implement real background + layer composition before/through Photoroom, or narrow the capability and docs/evals to the single-subject edit contract."
      - "Add regression coverage through image_op or validated image_task plan for the documented Photoroom composite call shape."
  - truth: "Each new provider has at least one eval case before its `quality.score` is populated; provider registration fails or warns if no eval case exists"
    status: failed
    reason: "The Photoroom composite_layers eval case can populate quality scores from invalid semantics: it compares output against composite-bg while the adapter uploads/edits composite-overlay and ignores params.input. The resulting score is not valid routing evidence for PROV-01."
    artifacts:
      - path: "eval/cases/photoroom.json"
        issue: "composite-photoroom-product-with-shadow sets params.input to composite-bg but production adapter ignores params.input and uploads layers[0].input."
      - path: "src/eval/run.ts"
        issue: "pixel_delta uses params.input as the baseline, so this case scores against a different image than the adapter edits."
      - path: "tests/eval/run.test.ts"
        issue: "test returns composite-bg from a fake Photoroom capability, so it proves score plumbing but not production Photoroom composite semantics."
    missing:
      - "Fix the Photoroom composite eval to invoke and score the same semantics production uses."
      - "Ensure applyEvalResultsToRegistry can only assign composite_layers:photoroom quality from a semantically valid Photoroom composite case."
human_verification:
  - test: "Run live Phase 11 evals with PHOTOROOM_API_KEY, FAL_KEY, and IDEOGRAM_API_KEY set."
    expected: "`npm run eval` writes scored results for extract_subject:photoroom, composite_layers:photoroom, edit_prompt:fal, and generate:ideogram, then list_capabilities shows quality.scores for all four."
    why_human: "External provider credentials and live API behavior are required; automated tests use mocked providers."
  - test: "After fixing the Photoroom composite contract, run image_task product-photography best-tier routing against a scored registry."
    expected: "Trace shows Photoroom selected for the product/shadow composite route with metadata.qualityMeasured=true and relevant qualityScores."
    why_human: "Requires live eval output plus planner/runtime behavior with real capability scores."
---

# Phase 11: Provider Breadth (Post-Eval) Verification Report

**Phase Goal:** Users can route through Photoroom, fal.ai, Flux Kontext, and Ideogram for capabilities where they measurably outperform existing providers
**Verified:** 2026-05-03T21:11:11Z
**Status:** gaps_found
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Product-photography `image_task` best-tier routes to Photoroom with trace evidence | FAILED | Photoroom composite path exists, but `src/capabilities/photoroom-composite-layers.ts:127-156` requires top-level input, uploads only `layers[0].input`, and does not apply layer placement. This invalidates the product/shadow route. |
| 2 | Fast-tier Replicate-class route can select a fal.ai mirror when measured cost/latency wins | VERIFIED | fal Flux Kontext registers as `edit_prompt:fal` in `src/capabilities/register.ts:44-47`, has eval cases in `eval/cases/fal-flux-kontext.json`, and trace metadata exposes scored/unscored state in `src/task/dag-executor.ts:157-177`. Planner prompt includes cost/latency fallback guidance in `src/task/planner.ts:73-80`. |
| 3 | Flux Kontext is registered for `edit_prompt` and selectable when measured edit score exceeds OpenAI | VERIFIED | `src/capabilities/fal-edit-prompt.ts:133-225` implements `edit_prompt:fal`; registration uses `allowUnscoredProduction` at `src/capabilities/register.ts:44-47`; `tests/eval/apply-results.test.ts:172-205` proves fal eval results populate scores. |
| 4 | Ideogram is registered for `generate` with measured text-fidelity scoring for text-heavy goals | VERIFIED | `generate` is in `CapabilityOp` at `src/capabilities/types.ts:1-10`, Ideogram implements `generate` in `src/capabilities/ideogram-generate.ts:88-156`, eval cases use `ocr_text_presence` in `eval/cases/ideogram.json`, and apply-results coverage verifies `generate:ideogram` scores in `tests/eval/apply-results.test.ts:184-208`. |
| 5 | Each new provider has eval coverage before quality scores are populated | FAILED | Photoroom extract, fal, and Ideogram have valid case plumbing. The Photoroom composite case is not valid evidence because `eval/cases/photoroom.json:35-47` scores `params.input` while the adapter ignores it and edits `layers[0].input` (`src/capabilities/photoroom-composite-layers.ts:139`). |
| 6 | Photoroom extract_subject is capability-only, API-key gated, and unscored-second-provider guarded | VERIFIED | Factory returns null without key at `src/capabilities/photoroom-extract-subject.ts:27-31`; registration uses `allowUnscoredProduction` at `src/capabilities/register.ts:34-37`; metadata includes provider/modelVersion at `src/capabilities/photoroom-extract-subject.ts:93-103`. |
| 7 | Photoroom composite_layers is capability-only, API-key gated, and intended as shadow/relighting path | FAILED | Adapter and registration exist, endpoint is `image-api.photoroom.com/v2/edit` at `src/capabilities/photoroom-composite-layers.ts:7-9`, and metadata marks `shadowApplied`; implementation semantics are blocking as above. |
| 8 | fal registers through `allowUnscoredProduction` without loosening the registry gate | VERIFIED | Registry still throws for unscored second providers unless explicitly allowed at `src/capabilities/registry.ts:31-47`; fal registration passes the option at `src/capabilities/register.ts:44-47` with a non-empty justification in `src/capabilities/fal-edit-prompt.ts:152-154`. |
| 9 | Ideogram sole-provider `generate` registration does not require unscored second-provider override | VERIFIED | `src/capabilities/register.ts:49-52` registers Ideogram without `allowUnscoredProduction`; registry gate only applies when same-op providers already exist. |
| 10 | `generate` validation is wired through capability, plan, eval, and image_op surfaces | VERIFIED | `src/capabilities/types.ts:1-10`, `src/capabilities/validation.ts:25-29`, `src/task/plan-schema.ts:17-26`, `src/task/plan-validator.ts:54`, `src/eval/cases.ts:26`, and `src/index.ts:453-457` include `generate`. |
| 11 | New provider invoke returns expose provider/modelVersion metadata | VERIFIED | Photoroom extract lines `97-103`, Photoroom composite lines `186-196`, fal lines `211-222`, and Ideogram lines `142-152` include provider/modelVersion metadata. |
| 12 | Phase 11 eval cases use deterministic scorers only | VERIFIED | Photoroom uses `alpha_coverage`/`pixel_delta`; fal uses `pixel_delta`/`ocr_text_presence`; Ideogram uses `ocr_text_presence`. No human scorer appears in new case files. |
| 13 | fal cases mirror OpenAI fixtures/prompts for head-to-head comparison | VERIFIED | `eval/cases/fal-flux-kontext.json:3-27` matches `eval/cases/edit-prompt.json:3-27` for product color and SALE 50 cases. |
| 14 | Trace enriches every resolved route with qualityMeasured and optional quality fields | VERIFIED | `computeRoutingTransparency` in `src/task/dag-executor.ts:157-177` emits `qualityMeasured`, `qualityScores`, `noIncumbentComparison`, and `qualityUnavailable`; success/error paths merge it at lines `212` and `227-328`. |
| 15 | Serialized response preserves trace metadata | VERIFIED | `src/task/serialize-response.ts:102-130` copies `traceNode.metadata` into response trace and guards only binary/base64 payloads. |
| 16 | Provider failure does not silently fallback | VERIFIED | `executeDag` resolves the planned capability once at `src/task/dag-executor.ts:312-336`; tests assert alternate provider is not invoked at `tests/task/dag-executor.test.ts:370-395`. |
| 17 | `applyEvalResultsToRegistry` populates scores by op/provider/modelVersion, including new providers | VERIFIED | `src/eval/apply-results.ts:51-77` iterates registry capabilities and keys by op/provider/modelVersion; `tests/eval/apply-results.test.ts:146-209` covers all Phase 11 providers. |
| 18 | Code review findings do not block phase goal | FAILED | CR-01, CR-02, and CR-03 are real blockers for PROV-01/PROV-05. They prevent valid Photoroom composite routing evidence. |
| 19 | Automated test/build baseline is green | VERIFIED | Orchestrator context reports `npm test` passed: 48 files, 292 tests; schema drift check `drift_detected=false`. |

**Score:** 15/19 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/capabilities/photoroom-extract-subject.ts` | Photoroom Remove Background `extract_subject` | VERIFIED | Exists, substantive, registered, API-key gated. |
| `src/capabilities/photoroom-composite-layers.ts` | Photoroom Image Editing `composite_layers` with shadow | FAILED | Exists and registered, but production contract is misaligned: top-level input gate, single uploaded layer, ignored placement/opacity. |
| `src/capabilities/fal-edit-prompt.ts` | fal Flux Kontext `edit_prompt` | VERIFIED | Exists, registered, API-key gated, metadata emitted. Warning remains: queue poll fetches lack per-request abort. |
| `src/capabilities/ideogram-generate.ts` | Ideogram `generate` | VERIFIED | Exists, registered, API-key gated, metadata emitted. Warning remains: initial generate fetch lacks timeout. |
| `eval/cases/photoroom.json` | Photoroom extract + composite eval coverage | FAILED | Extract cases are valid; composite case scores the wrong input semantics. |
| `eval/cases/fal-flux-kontext.json` | fal eval cases | VERIFIED | Two cases mirror OpenAI fixtures/prompts; text case includes OCR expectedText. |
| `eval/cases/ideogram.json` | Ideogram text-fidelity eval cases | VERIFIED | Two `generate` cases use `ocr_text_presence` and `expectedText`. |
| `src/task/dag-executor.ts` | Trace routing metadata | VERIFIED | Metadata computed from registry and emitted on success/error traces. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `src/capabilities/register.ts` | New provider factories | Factory invocation + registry.register | VERIFIED | Imports and invokes all four factories at lines `8-11` and `34-52`. |
| `src/capabilities/validation.ts` | `generate` param check | `capability.op === 'generate'` | VERIFIED | Lines `25-29` require non-empty prompt. |
| `src/index.ts` | `image_op` zod enum | `z.enum([...,'generate'])` | VERIFIED | Lines `453-457` include `generate` in description and enum. |
| `eval/cases/*.json` | `src/eval/run.ts` / `applyEvalResultsToRegistry` | `runEval` loads cases, invokes capability, scores, applies results | VERIFIED | `src/eval/run.ts:68-180` loads/runs cases and calls `applyEvalResultsToRegistry` after writing results. |
| `eval/cases/photoroom.json` composite case | Photoroom composite adapter and quality scores | Image Editing API + scorer + apply-results | FAILED | Case and adapter are connected, but they do not share the same input semantics. |
| `src/task/dag-executor.ts` | Trace quality metadata | Registry list/listScored | VERIFIED | Lines `157-177`, `212`, `227`, and `328`. |
| `src/task/serialize-response.ts` | Response trace | metadata copy | VERIFIED | Lines `102-130`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `src/eval/apply-results.ts` | `quality.scores` | Scored eval result entries matched by op/provider/modelVersion | Yes for valid results | VERIFIED |
| `src/task/dag-executor.ts` | `trace.nodes[].metadata.qualityScores` | Resolved capability registry quality | Yes when registry has scores | VERIFIED |
| `src/task/planner.ts` | capability snapshot quality | `registry.list()` serialized into system prompt | Yes | VERIFIED |
| `eval/cases/photoroom.json` composite score | `pixel_delta` baseline | `params.input` in `src/eval/run.ts` | No for production semantics | FAILED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full automated baseline | `npm test` | Orchestrator reports 48 files, 292 tests passed | PASS |
| Schema drift | schema drift check | Orchestrator reports `drift_detected=false` | PASS |
| Codebase drift | codebase drift check | Orchestrator reports warning-only README/eval remapping note | PASS |
| Live provider evals | `npm run eval` with provider keys | Not run in this environment | HUMAN |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| PROV-01 | 11-01, 11-02 | Photoroom registered for `extract_subject` (with shadow) and `composite_layers` product photography | BLOCKED | Extract provider is registered. Composite/shadow route is not goal-achieving due CR-01/CR-02/CR-03 evidence. |
| PROV-02 | 11-01, 11-02 | fal.ai registered as faster/cheaper mirror for Replicate-class capabilities | SATISFIED | `edit_prompt:fal` capability, registration, eval cases, scoring plumbing, and trace fields exist. |
| PROV-03 | 11-01, 11-02 | Flux Kontext registered for `edit_prompt` | SATISFIED | `src/capabilities/fal-edit-prompt.ts` and registration/eval coverage verified. |
| PROV-04 | 11-01, 11-02 | Ideogram registered for `generate` with measured text-fidelity score | SATISFIED | `generate` op, Ideogram adapter, OCR eval cases, and score application test verified. |
| PROV-05 | 11-02 | Each new provider has at least one eval case before `quality.score` is populated | BLOCKED | Score application gate exists, but Photoroom composite eval is semantically invalid and can populate an invalid quality score. |

No orphaned Phase 11 requirements were found beyond PROV-01 through PROV-05 in `.planning/REQUIREMENTS.md`.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---:|---|---|---|
| `src/capabilities/photoroom-composite-layers.ts` | 127 | Misleading `requiresInputImage: true` | BLOCKER | Rejects documented Photoroom composite calls that provide canvas/layers only. |
| `src/capabilities/photoroom-composite-layers.ts` | 139 | Reads only `layers[0].input` | BLOCKER | Silently drops additional layers and top-level input. |
| `src/capabilities/photoroom-composite-layers.ts` | 156 | Custom `imageGenMcp.layers` form field | BLOCKER | Placement/opacity metadata is not applied to provider output. |
| `eval/cases/photoroom.json` | 35 | Eval baseline not used by adapter | BLOCKER | Quality score can be populated from invalid product/shadow semantics. |
| `src/capabilities/ideogram-generate.ts` | 122 | Fetch without abort timeout | WARNING | Can hang live generate calls. Does not by itself disprove provider breadth. |
| `src/capabilities/fal-edit-prompt.ts` | 90 | Queue poll fetch without per-request timeout | WARNING | Can hang live polling despite overall timeout intent. |

### Human Verification Required

#### 1. Live Phase 11 Provider Evals

**Test:** Set `PHOTOROOM_API_KEY`, `FAL_KEY`, and `IDEOGRAM_API_KEY`, then run `npm run eval`.
**Expected:** Results include scored entries for `extract_subject:photoroom`, `composite_layers:photoroom`, `edit_prompt:fal`, and `generate:ideogram`; `list_capabilities` shows quality scores for all four.
**Why human:** Requires external credentials and live provider APIs.

#### 2. Product-Photography Routing After Composite Fix

**Test:** After fixing the Photoroom composite contract, run `image_task` with a best-tier product/shadow goal against a scored registry.
**Expected:** Trace shows Photoroom selected for product/shadow work with `metadata.qualityMeasured: true` and relevant `qualityScores`.
**Why human:** Requires live eval-derived scores and planner/runtime behavior with real provider credentials.

### Gaps Summary

Phase 11 is not ready to pass. Most provider breadth plumbing exists: `generate` is wired, fal and Ideogram have deterministic eval coverage, score application works, and trace metadata is visible. The blocker is Photoroom `composite_layers`, which is the planned PROV-01 product-photography shadow route. The adapter and eval case disagree about what image is being edited/scored, and the adapter does not implement the documented composite layer contract. Because that path can produce invalid quality scores, PROV-01 and PROV-05 are not achieved.

---

_Verified: 2026-05-03T21:11:11Z_
_Verifier: the agent (gsd-verifier)_
