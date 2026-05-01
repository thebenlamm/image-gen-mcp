---
phase: 05-capability-layer-image-op-first-2-caps
plan: 01
subsystem: capability-layer
tags: [typescript, nodenext, capability-registry, image-op]

requires: []
provides:
  - Typed capability data model and invoke contract
  - CapabilityRegistry for arbitrary op/provider routing
  - Capability module barrel exports and built-in registration hook
affects: [image_op, image_task, eval-harness, provider-breadth]

tech-stack:
  added: ["@imgly/background-removal-node@^1.4.5"]
  patterns:
    - "Capability providers use plain string identifiers instead of ProviderName"
    - "Capabilities register invoke functions in a registry parallel to ImageProvider"

key-files:
  created:
    - src/capabilities/index.ts
    - src/capabilities/types.ts
    - src/capabilities/registry.ts
    - src/capabilities/register.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "CapabilityRegistry remains separate from ProviderRegistry and does not modify v1 provider files."
  - "Used the latest published @imgly/background-removal-node range because ^1.7.0 is not published."

patterns-established:
  - "CapabilityKey uses `${CapabilityOp}:${provider}` for exact op/provider lookup."
  - "Model version changes clear capability quality metadata during registration."

requirements-completed: [CAP-01, CAP-02, CAP-03, CAP-04, CAP-05]

duration: 4min
completed: 2026-05-01
---

# Phase 05 Plan 01: Capability Layer Registry Summary

**Typed capability registry with op/provider invoke contracts and model-version quality invalidation**

## Performance

- **Duration:** 4 min
- **Started:** 2026-05-01T20:40:00Z
- **Completed:** 2026-05-01T20:43:55Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added the Phase 5 background-removal dependency and lockfile entries.
- Created the `src/capabilities` module with barrel exports and built-in registration hook.
- Defined the capability type model, including operation names, constraints, cost, optional quality scores, and invoke params/results.
- Implemented `CapabilityRegistry` with `register`, `get`, `list`, `listByProvider`, `has`, overwrite support, and model-version quality invalidation.
- Verified existing provider files remain untouched.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add capability package dependency and module skeleton** - `ce75ace` (chore)
2. **Task 2: Define capability types and invoke contract** - `acf0fd1` (feat)
3. **Task 3: Implement CapabilityRegistry** - `84e8ce2` (feat)

## Files Created/Modified

- `package.json` - Adds `@imgly/background-removal-node`.
- `package-lock.json` - Records dependency resolution.
- `src/capabilities/index.ts` - Barrel exports capability types, registry, and registration hook.
- `src/capabilities/types.ts` - Defines capability operations, constraints, cost, quality, invoke, capability, and key types.
- `src/capabilities/registry.ts` - Implements `CapabilityRegistry` and singleton `capabilityRegistry`.
- `src/capabilities/register.ts` - Exposes `registerBuiltInCapabilities()` for later built-in capability registration.

## Decisions Made

- Kept the capability layer parallel to `ImageProvider`; no `src/providers/*` files were modified.
- Kept capability `provider` as `string` to avoid coupling new providers to the existing closed `ProviderName` union.
- Copied incoming capabilities before invalidating quality so registration does not mutate caller-owned objects.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used latest published background-removal package version**
- **Found during:** Task 1 (Add capability package dependency and module skeleton)
- **Issue:** `npm install @imgly/background-removal-node@^1.7.0` failed because no `1.7.x` version is published to npm.
- **Fix:** Verified published versions with `npm view` and installed `@imgly/background-removal-node@^1.4.5`, the latest available version.
- **Files modified:** `package.json`, `package-lock.json`
- **Verification:** `package.json` contains the dependency and `package-lock.json` contains `node_modules/@imgly/background-removal-node`.
- **Committed in:** `ce75ace`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The dependency is installed and locked, but at the latest published version rather than the unavailable planned range.

## Issues Encountered

- Initial npm install inside the sandbox could not resolve `registry.npmjs.org`; reran with approved network access.
- npm reported audit findings after dependency installation. They were not remediated because audit remediation is outside this plan and may require unrelated dependency changes.

## Known Stubs

- `src/capabilities/register.ts:1` - `registerBuiltInCapabilities()` is intentionally empty in this plan. Later Phase 5 plans add concrete built-in capabilities against this hook.

## Threat Flags

None - this plan adds in-memory registry/type surface only. It does not add new network endpoints, auth paths, file access patterns, or provider execution code.

## Verification

- `npm run build` exits 0.
- `git diff -- src/providers/index.ts src/providers/openai.ts src/providers/gemini.ts src/providers/replicate.ts src/providers/together.ts src/providers/grok.ts` is empty.
- `src/capabilities/registry.ts` exposes `register`, `get`, `list`, `listByProvider`, and `has`.
- `src/capabilities/types.ts` uses `provider: string`, defines `invoke: CapabilityInvoke`, and does not reference `ProviderName`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The capability registry is ready for `image_op` and the first concrete capabilities. Later plans can register local/background-removal and OpenAI edit capabilities without changing the v1 provider interface.

## Self-Check: PASSED

- Verified created files exist: `src/capabilities/index.ts`, `src/capabilities/types.ts`, `src/capabilities/registry.ts`, `src/capabilities/register.ts`, and this summary.
- Verified task commits exist in git history: `ce75ace`, `acf0fd1`, `84e8ce2`.

---
*Phase: 05-capability-layer-image-op-first-2-caps*
*Completed: 2026-05-01*
