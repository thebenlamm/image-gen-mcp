---
phase: 07-eval-harness-golden-set
fixed_at: 2026-05-02T00:00:00Z
review_path: .planning/phases/07-eval-harness-golden-set/07-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
fix_branch: reviewfix-07
fix_worktree: /tmp/sv-07-reviewfix-OONgqm
---

# Phase 07: Code Review Fix Report

**Fixed at:** 2026-05-02
**Source review:** .planning/phases/07-eval-harness-golden-set/07-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (Critical=0, Warning=4)
- Fixed: 4
- Skipped: 0

**Branch:** `reviewfix-07` (in worktree `/tmp/sv-07-reviewfix-OONgqm`)
The current `main` branch was already checked out in the primary worktree, so
fixes were committed on a sibling branch within an isolated worktree to avoid
git's "branch already used by worktree" rejection. The orchestrator should
fast-forward `main` to `reviewfix-07` (or cherry-pick the four commits below)
to land the fixes.

## Fixed Issues

### WR-01: Worker-creation failure escapes `scoreOcrTextPresence`

**Files modified:** `src/eval/scorers.ts`
**Commit:** `e6a5495`
**Applied fix:** Moved `await createWorker('eng')` inside the `try` block,
declared `worker` as `Awaited<ReturnType<typeof createWorker>> | undefined`,
and guarded `terminate()` in the `finally` clause. Failures during worker
creation now produce a per-scorer `status: 'error'` result instead of
unwinding into `runEval`'s outer catch and discarding sibling scorer results.
**Verification:** Tier 2 (`npx tsc --noEmit` clean across project).

### WR-02: `isEvalCase` blanket-cast accepts arbitrary `op`/`provider` strings

**Files modified:** `src/eval/cases.ts`
**Commit:** `b28a2db`
**Applied fix:** Replaced the `value as EvalCase` cast with explicit
field-by-field validation against `Record<string, unknown>`. Added a
`CAPABILITY_OPS` set seeded from the *full* `CapabilityOp` union (9 values:
`extract_subject`, `edit_prompt`, `composite_layers`, `transform`,
`enhance_upscale`, `analyze_dimensions`, `analyze_palette`, `analyze_ocr`,
`generate`). The reviewer's suggested fix only listed the two ops in use
today — using only those would reject any future capability case. Typos like
`extract_subjct` now fail at load time with `Eval case file contains an
invalid case`.
**Verification:** Tier 2 (`npx tsc --noEmit` clean) + 9 cases/acceptance
tests passing.
**Adaptation note:** Expanded the reviewer's two-op set to the full nine ops
defined in `src/capabilities/types.ts` so the validator does not regress when
new ops are wired up.

### WR-03: `loadEvalCases` does not validate `expectedText` type for non-OCR cases

**Files modified:** `src/eval/cases.ts`
**Commit:** `e9b3ccc`
**Applied fix:** Added an unconditional check that rejects any
`params.expectedText` whose value is present but not a non-empty string. The
existing OCR-required check is reduced to a presence check
(`expectedText === undefined`). The literal error string
`'ocr_text_presence but is missing params.expectedText'` is preserved
verbatim because `tests/eval/phase7.acceptance.test.ts` (EVAL-03) greps the
loader source for it (see IN-04 — left intentional).
**Verification:** Tier 2 (`npx tsc --noEmit` clean) + 9 cases/acceptance
tests passing.

### WR-04: Partial-alpha test does not assert the actual coverage value

**Files modified:** `tests/eval/scorers.test.ts`
**Commit:** `f5fd902`
**Applied fix:** Replaced `expect(score.value).toBeGreaterThan(0)` +
`expect(score.value).toBeLessThanOrEqual(1)` with
`expect(score.value).toBe(0.5)` for the 2x4 partially-transparent rectangle
over the 4x4 transparent canvas. A regression that counted fully-transparent
pixels (yielding 1.0) now fails this test.
**Verification:** Tier 2 — partial-alpha test passes with the strict
assertion; non-OCR scorer suite passes (3 passed, 4 OCR tests skipped to
avoid network dependency).

---

_Fixed: 2026-05-02_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
