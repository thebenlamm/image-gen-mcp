---
phase: 05-capability-layer-image-op-first-2-caps
plan: 02
subsystem: capability-layer
tags: [typescript, nodenext, image-capabilities, openai, imgly]

requires:
  - 05-01 capability registry and invoke contract
provides:
  - Local extract_subject capability backed by @imgly/background-removal-node
  - OpenAI edit_prompt capability backed by the images edit endpoint
  - Built-in capability registration for the first two Phase 5 capabilities
affects: [image_op, image_task, eval-harness]

tech-stack:
  added: []
  patterns:
    - "Capabilities return PNG buffers and leave file persistence to image_op"
    - "Credential-gated providers return null from factories when unavailable"

key-files:
  created:
    - src/capabilities/extract-subject.ts
    - src/capabilities/edit-prompt.ts
  modified:
    - src/capabilities/register.ts

key-decisions:
  - "Kept extract_subject local and unconditional because @imgly does not require provider credentials."
  - "Kept edit_prompt conditional on OPENAI_API_KEY so startup remains usable without OpenAI credentials."
  - "Read input files inside capabilities but returned buffers only; output writes remain owned by image_op."

requirements-completed: [PRIM-01, PRIM-02, CAP-01, CAP-02, CAP-04]

duration: 3min
completed: 2026-05-01
---

# Phase 05 Plan 02: First Image Capabilities Summary

**Local subject extraction and OpenAI prompt editing registered in the capability layer**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-01T20:46:44Z
- **Completed:** 2026-05-01T20:49:20Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added `extract_subject` as an `@imgly/local` capability using `removeBackground`.
- Added `edit_prompt` as an OpenAI capability using `client.images.edit`.
- Added capability-level input validation for required image path and prompt values.
- Registered built-in capabilities through `capabilityRegistry`, with OpenAI registration skipped when `OPENAI_API_KEY` is missing.
- Preserved the Phase 5 contract that capabilities return buffers and do not save files.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement extract_subject @imgly capability** - `db477ff` (feat)
2. **Task 2: Implement edit_prompt OpenAI capability** - `fd14a01` (feat)
3. **Task 3: Register built-in capabilities** - `4beddda` (feat)

## Files Created/Modified

- `src/capabilities/extract-subject.ts` - Creates the local `extract_subject` capability, validates `params.input`, reads the input file, calls `removeBackground`, and returns a PNG buffer.
- `src/capabilities/edit-prompt.ts` - Creates the credential-gated OpenAI `edit_prompt` capability, validates input and prompt length, calls `images.edit`, and decodes the returned base64 PNG.
- `src/capabilities/register.ts` - Registers extract subject unconditionally and OpenAI edit conditionally.

## Decisions Made

- Used the installed OpenAI SDK `toFile` helper with a file buffer so the edit endpoint receives a supported upload shape after the capability reads the input file.
- Left `quality` unset on both initial capabilities so `quality.scores` remains undefined until eval data exists.
- Did not modify existing `src/providers/*.ts` files; capability code remains parallel to v1 provider code.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `.planning/STATE.md` had incidental worktree drift from orchestration context before task commits. It was restored and was not included in any commit.

## Known Stubs

None.

## Threat Flags

None - the plan's threat model already covered the new local file reads and OpenAI edit provider call. No additional network endpoints, auth paths, or schema changes were introduced.

## Verification

- `npm run build` exits 0.
- `src/capabilities/extract-subject.ts` contains `removeBackground`, `provider: '@imgly/local'`, `requiresInputImage: true`, and `fs.promises.readFile`.
- `src/capabilities/extract-subject.ts` does not contain `ImageProvider`.
- `src/capabilities/edit-prompt.ts` contains `new OpenAI`, `images.edit`, `provider: 'openai'`, `maxPromptLength: 4000`, and the required prompt length error.
- `src/capabilities/register.ts` contains both capability factories and registers through `capabilityRegistry.register`.
- `git diff -- src/providers` is empty.

## User Setup Required

None for local extraction. OpenAI edit registration requires `OPENAI_API_KEY`, matching existing OpenAI provider behavior.

## Next Phase Readiness

The first two capabilities are available for Plan 05-03 to expose through `image_op`.

## Self-Check: PASSED

- Verified created/modified files exist: `src/capabilities/extract-subject.ts`, `src/capabilities/edit-prompt.ts`, `src/capabilities/register.ts`, and this summary.
- Verified task commits exist in git history: `db477ff`, `fd14a01`, `4beddda`.

---
*Phase: 05-capability-layer-image-op-first-2-caps*
*Completed: 2026-05-01*
