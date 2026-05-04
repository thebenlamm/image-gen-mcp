---
phase: 07-eval-harness-golden-set
plan: 03
subsystem: testing
tags: [eval, scoring, ocr, tesseract, alpha-coverage, gap-closure]

# Dependency graph
requires:
  - phase: 07-eval-harness-golden-set/07-01
    provides: eval fixtures, cases, scorers, runner infrastructure
  - phase: 07-eval-harness-golden-set/07-02
    provides: capability registry quality guardrails and apply-results

provides:
  - Correct alpha coverage scorer counting all foreground pixels (not just partial-alpha edges)
  - Real tesseract.js OCR text-presence scoring with worker lifecycle management
  - Machine-readable expectedText values in OCR-backed edit cases
  - Scorer id validation in loadEvalCases() before capability invocation
  - EVAL-03 acceptance test asserting OCR placeholder absence

affects: [eval-harness, capability-routing, scorer-quality, phase-8-ocr]

# Tech tracking
tech-stack:
  added: [tesseract.js@^7.0.0]
  patterns:
    - "OCR worker lifecycle: create in function, terminate in finally block (T-07-12)"
    - "normalizeOcrText() for case-insensitive whitespace-normalized substring matching"
    - "SCORERS Set in cases.ts for enum validation before provider invocation"
    - "Fail-fast OCR validation in loadEvalCases() for missing expectedText"

key-files:
  created:
    - tests/eval/cases.test.ts
  modified:
    - src/eval/scorers.ts
    - src/eval/cases.ts
    - eval/cases/edit-prompt.json
    - tests/eval/scorers.test.ts
    - tests/eval/phase7.acceptance.test.ts
    - package.json
    - package-lock.json
    - .gitignore

key-decisions:
  - "Use tesseract.js@^7.0.0 as eval dependency; not a runtime MCP server dependency"
  - "OCR reason strings must not include extracted text (T-07-14 information disclosure)"
  - "eval/results/ excluded from git; generated runtime output per .gitignore"
  - "*.traineddata excluded from git; downloaded by tesseract.js at first run"

patterns-established:
  - "Threat mitigations T-07-12 (worker terminate), T-07-13 (expectedText required), T-07-14 (no OCR text in reason), T-07-15 (scorer id set validation) all implemented"

requirements-completed: [EVAL-03]

# Metrics
duration: 8min
completed: 2026-05-02
---

# Phase 7 Plan 03: Eval Scorer Gap Closure Summary

**Replaced alpha coverage stub (partial-alpha only) and OCR placeholder (always skipped) with correct implementations; eval now scores all Phase 7 capabilities including OCR round-trip without manual intervention**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-02T22:38:20Z
- **Completed:** 2026-05-02T22:46:40Z
- **Tasks:** 4
- **Files modified:** 8

## Accomplishments

- Fixed `scoreAlphaCoverage()` to count all foreground pixels (alpha > 0), not just semi-transparent edge pixels — opaque hard-mask outputs now score correctly
- Replaced `scoreOcrTextPresence()` placeholder with real tesseract.js worker; OCR scorer returns scored/error status and never returns "ocr dependency unavailable"
- Added machine-readable `expectedText` to both OCR-backed edit cases in `eval/cases/edit-prompt.json`
- Added `SCORERS` set validation and OCR expectedText pre-check in `loadEvalCases()` to reject bad cases before provider invocation
- `npm run eval` exits 0 with 5 scored extract_subject entries and OCR-backed edit cases scoring value: 1

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix alpha coverage semantics** - `19d6c35` (fix)
2. **Task 2: Add real OCR text-presence scoring with tesseract.js** - `2bcc116` (feat)
3. **Task 3: Make OCR case metadata explicit and validate scorer ids** - `7102a4e` (feat)
4. **Task 4: Re-run Phase 7 verification** - `ce3e9df` (test)

## Files Created/Modified

- `src/eval/scorers.ts` - Fixed alpha coverage semantics; replaced OCR placeholder with tesseract.js real scoring
- `src/eval/cases.ts` - Added SCORERS set validation; OCR expectedText pre-check in loadEvalCases()
- `eval/cases/edit-prompt.json` - Added expectedText: "SALE 50" and "CLOSED" to OCR-backed cases
- `tests/eval/scorers.test.ts` - Renamed alpha test; added opaque hard-mask fixture; replaced placeholder test with real OCR tests
- `tests/eval/cases.test.ts` - New: regression coverage for expectedText preservation and scorer id validation
- `tests/eval/phase7.acceptance.test.ts` - Added EVAL-03 acceptance test asserting OCR placeholder absent, expectedText present, loader validation present
- `package.json` / `package-lock.json` - Added tesseract.js@^7.0.0
- `.gitignore` - Added *.traineddata and eval/results/ exclusions

## Decisions Made

- tesseract.js@^7.0.0 installed as a production dependency (not devDependency) since eval run.ts imports it
- OCR `reason` strings intentionally omit extracted text to prevent information disclosure (T-07-14)
- `eval/results/` excluded from git as generated runtime output; historical results not needed in repo
- `*.traineddata` excluded from git; tesseract.js downloads eng.traineddata at first run to the working directory

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added eval/results/ and *.traineddata to .gitignore**
- **Found during:** Task 2 (installing tesseract.js)
- **Issue:** `eng.traineddata` (5MB OCR model) and `eval/results/*.json` appeared as untracked files after test run; neither should be committed
- **Fix:** Added `*.traineddata` and `eval/results/` to .gitignore
- **Files modified:** .gitignore
- **Verification:** `git status --short` shows no untracked artifacts after eval run
- **Committed in:** 2bcc116 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** .gitignore additions prevent 5MB OCR model and generated result JSONs from being accidentally committed. No scope creep.

## Issues Encountered

The worktree was created from an older base commit (phase-06, 9a8809e) rather than the plan's expected base (2652633). Phase 07 eval infrastructure did not exist in the worktree. Resolved by copying eval source files, tests, fixtures, and config from the main workspace into the worktree before execution. The eval infrastructure files were committed as part of Task 4 to ensure the worktree is a complete, self-contained representation of the work.

## Known Stubs

None - all previously stubbed scorers are now fully implemented.

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes introduced beyond what the plan's threat model covers.

## Next Phase Readiness

- Phase 7 verification gap is closed: EVAL-03 is now satisfied
- OCR scoring is available for future capabilities that produce text in output images
- Phase 8 can build `analyze_ocr` capability (locked decision: not implemented here)
- Registry quality scores from `npm run eval` are trustworthy for evidence-based capability routing

---
*Phase: 07-eval-harness-golden-set*
*Completed: 2026-05-02*
