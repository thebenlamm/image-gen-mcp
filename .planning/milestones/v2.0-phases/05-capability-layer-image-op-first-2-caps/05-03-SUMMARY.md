---
phase: 05-capability-layer-image-op-first-2-caps
plan: 03
subsystem: capability-layer
tags: [typescript, nodenext, mcp-tool, image-op]

requires:
  - 05-01 capability registry and invoke contract
  - 05-02 first built-in capabilities
provides:
  - image_op MCP tool for direct op/provider capability invocation
  - Pre-invocation capability existence and constraint validation
  - Capability output persistence through existing image output rules
affects: [image_op, image_task, run-artifacts]

tech-stack:
  added: []
  patterns:
    - "Capability validation happens before capability.invoke"
    - "image_op returns trace metadata and file paths only"

key-files:
  created:
    - src/capabilities/validation.ts
  modified:
    - src/index.ts

key-decisions:
  - "Kept image_op persistence centralized in src/index.ts via resolveOutputPath and saveImage."
  - "Kept Phase 5 runId response-only; persistent run directories are deferred to Phase 6."
  - "Returned available providers for a missing op/provider without invoking any capability."

requirements-completed: [OP-01, OP-02, OP-03, OP-04, CAP-03, PRIM-01, PRIM-02]

duration: 2min
completed: 2026-05-01
---

# Phase 05 Plan 03: image_op Tool Summary

**Direct capability invocation through `image_op` with preflight validation and path-only traces**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-01T20:51:59Z
- **Completed:** 2026-05-01T20:53:50Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Added `validateCapabilityParams()` for required input paths, edit prompts, prompt length limits, and supported size checks.
- Registered built-in capabilities during server startup and logged the registered `op:provider` pairs.
- Added the `image_op` MCP tool with `{op, provider, params, outputPath, outputDir}` input.
- Ensured missing capability errors and constraint violations occur before `capability.invoke`.
- Saved returned PNG buffers with existing `resolveOutputPath()` and `saveImage()` rules.
- Returned successful responses containing `output`, `runId`, and `trace.nodes[0].output` without base64 image data.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add capability constraint validation helper** - `bd78895` (feat)
2. **Task 2: Initialize capability registry at server startup** - `27031b3` (feat)
3. **Task 3: Register image_op MCP tool** - `5c128db` (feat)

## Files Created/Modified

- `src/capabilities/validation.ts` - Adds pure capability constraint validation with no file reads or capability invocation.
- `src/index.ts` - Registers built-in capabilities at startup, logs capability inventory, and exposes `image_op`.

## Decisions Made

- Kept validation separate from capability implementations so `image_op` owns preflight checks consistently.
- Kept `image_op` output persistence outside capabilities to preserve the buffer-returning capability contract from Plan 05-02.
- Used a timestamp plus random hex `runId` as response metadata only, matching the Phase 5 boundary before Phase 6 persistent run artifacts.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

None - the plan's threat model covered the new MCP tool surface, pre-invocation validation, file-path-only responses, and response-only `runId`.

## Verification

- `npm run build` exits 0.
- `src/capabilities/validation.ts` exports `validateCapabilityParams`, contains all planned validation errors, and does not contain `invoke(`.
- `src/index.ts` contains `registerBuiltInCapabilities();`, `capabilityRegistry.list()`, and the existing `generate_image`, `process_image`, and `generate_asset` tools.
- `src/index.ts` contains `image_op`, missing capability handling, `validateCapabilityParams(capability, params)`, `capability.invoke`, `resolveOutputPath({`, `runId`, and `trace`.
- Stub scan found only pre-existing provider availability text in `src/index.ts`; no new placeholders or unwired stubs were introduced.

## User Setup Required

None. `extract_subject` works locally when its input file exists; `edit_prompt` remains available when `OPENAI_API_KEY` is configured.

## Next Phase Readiness

`image_op` is ready for Phase 6 run/session artifact wiring and later `image_task` DAG execution.

## Self-Check: PASSED

- Verified files exist: `src/capabilities/validation.ts`, `src/index.ts`, and this summary.
- Verified task commits exist in git history: `bd78895`, `27031b3`, `5c128db`.

---
*Phase: 05-capability-layer-image-op-first-2-caps*
*Completed: 2026-05-01*
