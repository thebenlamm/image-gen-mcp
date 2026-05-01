---
phase: 05-capability-layer-image-op-first-2-caps
verified: 2026-05-01T21:07:40Z
status: human_needed
score: 16/16 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Call image_op extract_subject from Claude Code"
    expected: "Returns success true with output, runId, trace.nodes[0].output, and the saved PNG is a clean alpha cutout"
    why_human: "Code path and local capability are verified, but visual cutout quality and MCP client invocation need human confirmation"
  - test: "Call image_op edit_prompt from Claude Code with OPENAI_API_KEY configured"
    expected: "Returns success true with output, runId, trace.nodes[0].output, and the saved image reflects the requested GPT Image prompt edit"
    why_human: "Requires live OpenAI credentials/network and visual assessment of edited output"
---

# Phase 5: Capability Layer + image_op + First 2 Caps Verification Report

**Phase Goal:** Developers can register and invoke arbitrary (op, provider) pairs through `image_op` without modifying the existing `ImageProvider` interface; users can extract subjects and edit images via prompt
**Verified:** 2026-05-01T21:07:40Z
**Status:** human_needed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `image_op` can route `extract_subject` / `@imgly/local` and save a path | VERIFIED | `src/index.ts:424-483` registers `image_op`, invokes capability, saves via `resolveOutputPath`/`saveImage`, and returns `output`, `runId`, `trace`; `src/capabilities/extract-subject.ts:18-46` implements `@imgly/local` |
| 2 | `image_op` can route `edit_prompt` / `openai` via GPT Image and save a path | VERIFIED | `src/capabilities/edit-prompt.ts` conditionally creates OpenAI capability with default `gpt-image-1.5`, calls JSON `/v1/images/edits`, returns buffer; `src/index.ts:455-483` persists output |
| 3 | Unregistered `(op, provider)` returns clear error before provider call | VERIFIED | `src/index.ts:437-450` checks `capabilityRegistry.get()` and returns `Capability not registered...` before `validateCapabilityParams` or `capability.invoke` |
| 4 | Constraint violations return before provider call | VERIFIED | `src/index.ts:453-455` calls `validateCapabilityParams` before `capability.invoke`; `src/capabilities/validation.ts:7-37` covers input, prompt, max prompt length, and size |
| 5 | Existing v1 providers remain unmodified and extract-only capability does not implement `ImageProvider.generate()` | VERIFIED | `git diff -- src/providers/*` was empty; `rg` found no `ProviderName`, `ImageProvider`, or `generate(` references under `src/capabilities` |
| 6 | CapabilityRegistry is parallel to ImageProvider | VERIFIED | `src/capabilities/registry.ts:3-47` implements separate registry; `src/capabilities/types.ts:48-57` defines capability contract without provider imports |
| 7 | Capability provider names are plain strings | VERIFIED | `src/capabilities/types.ts:50` uses `provider: string`; no `ProviderName` import in capability files |
| 8 | Capabilities register invoke functions instead of ImageProvider.generate | VERIFIED | `src/capabilities/types.ts:56` requires `invoke`; built-ins register capabilities through `src/capabilities/register.ts:5-13` |
| 9 | `quality.scores` is undefined initially and invalidated when `modelVersion` changes | VERIFIED | Built-in capability objects omit `quality`; `src/capabilities/registry.ts:11-12` clears `incoming.quality`; node spot-check confirmed changed modelVersion produces undefined quality |
| 10 | `extract_subject` is registered as `@imgly/local` with no API key requirement | VERIFIED | `src/capabilities/register.ts:6` registers unconditionally; `src/capabilities/extract-subject.ts:20-29` defines op/provider/cost/constraints |
| 11 | `edit_prompt` is registered as `openai` and uses OpenAI image edit endpoint | VERIFIED | `src/capabilities/register.ts:8-10` registers when factory returns a capability; `src/capabilities/edit-prompt.ts` uses JSON `/v1/images/edits` with image data URL references |
| 12 | Capabilities return buffers and leave saving to `image_op` | VERIFIED | Capability results return `buffer` only at `extract-subject.ts:40-44` and `edit-prompt.ts:79-84`; saving occurs in `src/index.ts:456-462` |
| 13 | `image_op` validates capability existence before invocation | VERIFIED | Missing capability branch returns at `src/index.ts:439-450`; invocation is later at `src/index.ts:455` |
| 14 | `image_op` accepts file path inputs through `params.input` | VERIFIED | Tool schema accepts `params` as record at `src/index.ts:428-430`; validation requires `params.input` for image-input capabilities |
| 15 | `image_op` saves capability output through existing output rules | VERIFIED | `src/index.ts:456-462` calls `resolveOutputPath` and `saveImage` imported from `src/utils/image.ts` |
| 16 | `image_op` response includes `output`, `runId`, and `trace` | VERIFIED | Success response includes all three at `src/index.ts:467-483`; error response includes `runId` and trace at `src/index.ts:491-504` |

**Score:** 16/16 truths verified by code/build checks

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/capabilities/types.ts` | Capability data model and invoke contract | VERIFIED | Exports op, constraints, quality, invoke params/result, capability, key |
| `src/capabilities/registry.ts` | CapabilityRegistry implementation | VERIFIED | `register`, `get`, `list`, `listByProvider`, `has`; modelVersion quality invalidation |
| `src/capabilities/register.ts` | Built-in registration | VERIFIED | Registers extract subject unconditionally and OpenAI edit conditionally |
| `src/capabilities/index.ts` | Barrel exports | VERIFIED | Exports types, registry, register |
| `src/capabilities/extract-subject.ts` | Local subject extraction | VERIFIED | Uses `@imgly/background-removal-node`, returns PNG buffer |
| `src/capabilities/edit-prompt.ts` | OpenAI image edit capability | VERIFIED | Uses `OPENAI_API_KEY`, `OPENAI_EDIT_MODEL` or `gpt-image-1.5` default, JSON image edits, base64-to-buffer |
| `src/capabilities/validation.ts` | Pre-invocation validation | VERIFIED | Pure validation helper; no invocation/file reads |
| `src/index.ts` | `image_op` MCP tool and startup capability registration | VERIFIED | Startup registration, registry lookup, validation, invoke, save, trace |
| `package.json` | Background removal dependency | VERIFIED | Contains `@imgly/background-removal-node` at published `^1.4.5` |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `register.ts` | `registry.ts` | `capabilityRegistry.register` | VERIFIED | `gsd-sdk verify.key-links` passed |
| `edit-prompt.ts` | OpenAI API convention | `OPENAI_API_KEY`, edit model default | VERIFIED | `OPENAI_API_KEY` and `gpt-image-1.5` default present |
| `index.ts` | `register.ts` | startup `registerBuiltInCapabilities()` | VERIFIED | Called at `src/index.ts:38` |
| `index.ts` | `registry.ts` | `capabilityRegistry.get` | VERIFIED | Lookup at `src/index.ts:437` |
| `index.ts` | `utils/image.ts` | `resolveOutputPath` and `saveImage` | VERIFIED | Save path at `src/index.ts:456-462` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `src/index.ts` | `capability` | `capabilityRegistry.get(op, provider)` after startup registration | Yes | FLOWING |
| `src/index.ts` | `result.buffer` | `capability.invoke({ params, outputPath, outputDir })` | Yes, from registered provider implementation | FLOWING |
| `src/index.ts` | `filePath` | `resolveOutputPath({ outputPath, outputDir, prompt, provider })` | Yes | FLOWING |
| `src/capabilities/extract-subject.ts` | `buffer` | `removeBackground(filePath)` converted by `toBuffer` | Yes | FLOWING |
| `src/capabilities/edit-prompt.ts` | `buffer` | OpenAI JSON image edit `b64_json` decoded to Buffer | Yes when credentials/provider response exist | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| TypeScript build | `npm run build` | Exited 0 | PASS |
| Registry quality invalidation | `node -e import('./dist/capabilities/registry.js')...` | `has:true`, `list:1`, `byProvider:1`, omitted `quality` after model change | PASS |
| Constraint validation | `node -e import('./dist/capabilities/validation.js')...` | Returned `edit_prompt prompt exceeds max length 4000` and unsupported size error | PASS |
| Tests | `npm test` | Skipped: package.json has no test script | SKIP |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| CAP-01 | 05-01, 05-02 | Register capability without modifying ImageProvider | SATISFIED | `CapabilityRegistry.register()` in `registry.ts`; provider diff empty |
| CAP-02 | 05-01, 05-02 | Extract-only provider without `ImageProvider.generate()` | SATISFIED | `extract-subject.ts` defines `invoke`; no `ImageProvider`/`generate` in capability files |
| CAP-03 | 05-01, 05-03 | Registry exposes routing methods | SATISFIED | `registry.ts` has `get`, `list`, `listByProvider` |
| CAP-04 | 05-01, 05-02 | `quality.scores` undefined until eval | SATISFIED | Type optional; built-ins omit `quality` |
| CAP-05 | 05-01 | modelVersion change invalidates scores | SATISFIED | `registry.ts:11-12`; node spot-check passed |
| OP-01 | 05-03 | `image_op` returns `{output, runId, trace}` | SATISFIED | `src/index.ts:467-483` |
| OP-02 | 05-03 | Missing capability validated clearly | SATISFIED | `src/index.ts:437-450` |
| OP-03 | 05-03 | Constraint violations before provider call | SATISFIED | `src/index.ts:453-455`; `validation.ts` |
| OP-04 | 05-03 | File path inputs and existing output rules | SATISFIED | `params.input` validation; `resolveOutputPath`/`saveImage` |
| PRIM-01 | 05-02, 05-03 | `extract_subject` via local background removal | SATISFIED | `extract-subject.ts` and unconditional registration |
| PRIM-02 | 05-02, 05-03 | `edit_prompt` via OpenAI GPT Image edit | SATISFIED | `edit-prompt.ts` uses JSON `/v1/images/edits`, default `gpt-image-1.5` |

No Phase 5 requirement IDs from `.planning/REQUIREMENTS.md` are orphaned; all 11 are declared in plan frontmatter and accounted for above.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---:|---|---|---|
| `src/capabilities/edit-prompt.ts` | 17 | `return null` when `OPENAI_API_KEY` missing | Info | Intentional credential gate; startup remains usable |
| `src/capabilities/edit-prompt.ts` | 73,77 | `b64_json` handling | Info | Provider response decoding only; `image_op` response does not expose base64 |
| `src/index.ts` | 85,543 | "not available" provider text | Info | Existing/user-facing provider availability messages |

### Human Verification Required

### 1. `image_op` Extract Subject

**Test:** From Claude Code, call `image_op` with `{op: 'extract_subject', provider: '@imgly/local', params: {input: '/path/to/photo.png'}}`.
**Expected:** Response has `success: true`, `output`, `runId`, `trace.nodes[0].output`; saved PNG is a clean alpha cutout.
**Why human:** Static/runtime checks verify the route, but the roadmap requires visual cutout quality and actual MCP client invocation.

### 2. `image_op` OpenAI Prompt Edit

**Test:** With `OPENAI_API_KEY` configured, call `image_op` with `{op: 'edit_prompt', provider: 'openai', params: {input: '/path/to/photo.png', prompt: '...'}}`.
**Expected:** Response has `success: true`, `output`, `runId`, `trace.nodes[0].output`; saved PNG reflects the requested edit via GPT Image.
**Why human:** Requires live OpenAI credentials/network and visual assessment of the edited image.

### Gaps Summary

No blocking codebase gaps found. Automated checks verify the capability layer, first two capabilities, `image_op` wiring, pre-invocation validation, standard output saving, `runId`, trace, and requirement coverage. Status remains `human_needed` because two roadmap success criteria require live MCP/user-visible validation.

---

_Verified: 2026-05-01T21:07:40Z_
_Verifier: the agent (gsd-verifier)_
