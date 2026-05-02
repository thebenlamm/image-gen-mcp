---
phase: 07-eval-harness-golden-set
plan: 01
subsystem: testing
tags: [eval, fixtures, scoring, capability-registry, pixelmatch]

requires:
  - phase: 05-capability-layer-image-op-first-2-caps
    provides: "CapabilityRegistry and extract_subject/edit_prompt capability registrations"
  - phase: 06-run-session-artifact-layer
    provides: "Atomic file writes reused by eval result and artifact persistence"
provides:
  - "Deterministic golden fixture catalog with 10 PNG images"
  - "Per-capability eval case JSON for extract_subject and edit_prompt"
  - "Eval runner that invokes registered capabilities, scores outputs, and writes JSON results"
  - "Programmatic alpha coverage, pixel delta, and OCR placeholder scorer entry points"
affects: [eval, capability-quality, provider-routing, phase-07-plan-02]

tech-stack:
  added: [pixelmatch, "@types/pixelmatch"]
  patterns:
    - "Eval case JSON resolves fixture-relative input placeholders through loadEvalCases()"
    - "Provider-backed eval cases use requiredEnv guards before capability invocation"
    - "Eval results store paths and scores only, not prompts, API keys, or base64 image data"

key-files:
  created:
    - eval/fixtures/manifest.json
    - eval/fixtures/*.png
    - eval/cases/extract-subject.json
    - eval/cases/edit-prompt.json
    - src/eval/types.ts
    - src/eval/fixtures.ts
    - src/eval/cases.ts
    - src/eval/scorers.ts
    - src/eval/results.ts
    - src/eval/run.ts
    - scripts/run-eval.ts
    - tests/eval/*.test.ts
  modified:
    - package.json
    - package-lock.json
    - .gitignore
    - src/eval/index.ts

key-decisions:
  - "Generated deterministic local PNG fixtures with sharp instead of using network or AI image generation."
  - "Ignored eval/results/ because npm run eval produces runtime verification artifacts."
  - "Kept OCR scoring as a deterministic skipped scorer until Phase 8 adds OCR dependencies."

patterns-established:
  - "Eval runner continues after per-case errors and only fails the harness when no case is scored."
  - "Eval result writer owns timestamped paths under eval/results/ and does not accept caller-provided result paths."

requirements-completed: [EVAL-01, EVAL-02, EVAL-03]

duration: 11min
completed: 2026-05-02
---

# Phase 07 Plan 01: Eval Harness Golden Set Summary

**Deterministic eval harness foundation with 10 golden PNG fixtures, capability case files, scorer primitives, and `npm run eval` JSON output**

## Performance

- **Duration:** 11 min
- **Started:** 2026-05-02T20:31:20Z
- **Completed:** 2026-05-02T20:42:41Z
- **Tasks:** 4
- **Files modified:** 28

## Accomplishments

- Added exactly 10 committed PNG fixtures spanning product, person, text-heavy, transparent-edge, and low-contrast categories.
- Added eval case definitions for local `extract_subject/@imgly/local` and provider-backed `edit_prompt/openai`.
- Implemented scorer entry points for `alpha_coverage`, `pixel_delta`, and deterministic skipped OCR.
- Implemented `runEval()` with env gating, capability lookup, artifact writes, scorer execution, per-case error continuation, and JSON result persistence.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add eval script and deterministic fixture/case schema** - `f588bfa` (feat)
2. **Task 2: Create the 10 golden PNG fixtures deterministically** - `43869d5` (feat)
3. **Task 3: Implement programmatic scorers and result writer** - `edea50c` (feat)
4. **Task 4: Implement runEval orchestration and command coverage** - `253ef97` (feat)

## Files Created/Modified

- `eval/fixtures/manifest.json` - Golden fixture catalog with IDs, categories, tags, and descriptions.
- `eval/fixtures/*.png` - Ten deterministic 256x256 PNG fixture images.
- `eval/cases/extract-subject.json` - Local extract-subject cases scored by alpha coverage.
- `eval/cases/edit-prompt.json` - OpenAI edit-prompt cases skipped without usable `OPENAI_API_KEY`.
- `src/eval/*.ts` - Eval contracts, loaders, scorers, result writer, and runner.
- `scripts/run-eval.ts` - CLI entrypoint used by `npm run eval`.
- `tests/eval/*.test.ts` - Focused coverage for fixtures, scorers, results, and orchestration.
- `package.json`, `package-lock.json` - Added `eval` script and pixelmatch dependencies.
- `.gitignore` - Ignores generated `eval/results/` runtime artifacts.

## Decisions Made

- Used checked-in sharp-generated PNGs rather than committing a generator script; the plan required committed deterministic fixtures, not regeneration tooling.
- Kept `eval/results/` out of git because results are timestamped verification/runtime output.
- Used placeholder env detection for `${OPENAI_API_KEY}` so MCP-style unresolved placeholders skip provider-backed eval cases without network calls.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Deferred missing barrel exports until modules existed**
- **Found during:** Task 2 (Create the 10 golden PNG fixtures deterministically)
- **Issue:** Task 1 required `src/eval/index.ts` to export `scorers.ts`, `results.ts`, and `run.ts`, but those files are created in later tasks. The Task 2 build gate would fail on missing modules.
- **Fix:** Temporarily limited the barrel to implemented modules, then restored scorer/result/run exports as those modules were added.
- **Files modified:** `src/eval/index.ts`
- **Verification:** `npm run build`
- **Committed in:** `43869d5`, `edea50c`, `253ef97`

**2. [Rule 3 - Blocking] Ignored generated eval result artifacts**
- **Found during:** Task 4 (Implement runEval orchestration and command coverage)
- **Issue:** `npm run eval` correctly generates timestamped JSON and PNG artifacts under `eval/results/`, which would otherwise remain as untracked runtime output after verification.
- **Fix:** Added `eval/results/` to `.gitignore`.
- **Files modified:** `.gitignore`
- **Verification:** `git status --short` showed no untracked generated eval results.
- **Committed in:** `253ef97`

---

**Total deviations:** 2 auto-fixed (2 Rule 3)
**Impact on plan:** Both fixes were necessary to satisfy required build and clean-worktree gates. No product behavior or eval scope was expanded.

## Issues Encountered

- `tsx` could not create its IPC pipe inside the sandbox for `npm run eval` (`listen EPERM` under the system temp directory). The command was rerun with approved escalation and passed.
- The first fake PNG buffer in `tests/eval/run.test.ts` was not accepted by `sharp`; the test fake was changed to generate a valid PNG through `sharp`.

## Known Stubs

- `src/eval/scorers.ts` - `scoreOcrTextPresence()` intentionally returns `status: "skipped"` with reason `"ocr dependency unavailable"` until Phase 8 adds OCR support.

## Verification

- `npm test -- tests/eval/fixtures.test.ts tests/eval/scorers.test.ts tests/eval/results.test.ts tests/eval/run.test.ts` - passed, 12 tests.
- `OPENAI_API_KEY='${OPENAI_API_KEY}' npm run eval` - passed, wrote `eval/results/2026-05-02T20-42-15-557Z.json`.
- `npm run build` - passed.
- `find eval/fixtures -maxdepth 1 -name '*.png' | wc -l` - returned `10`.
- Latest eval result check - schemaVersion `1`, 5 scored `extract_subject` entries, 3 skipped `edit_prompt/openai` entries.

## User Setup Required

None - no external service configuration required for local eval execution. OpenAI-backed edit cases are included but skip unless `OPENAI_API_KEY` is set to a usable value.

## Next Phase Readiness

Plan 07-02 can consume eval result JSON from `npm run eval` and wire score application into the capability registry. EVAL-04 and EVAL-05 remain pending for the next plan.

## Self-Check: PASSED

- Summary file exists.
- Key created files exist: `src/eval/run.ts`, `scripts/run-eval.ts`, and `eval/fixtures/product-simple.png`.
- Task commits found: `f588bfa`, `43869d5`, `edea50c`, `253ef97`.

---
*Phase: 07-eval-harness-golden-set*
*Completed: 2026-05-02*
