---
phase: 260424-h6z-add-check-models
plan: 01
subsystem: tooling
tags: [tooling, scripts, providers, maintenance]
requires: []
provides:
  - npm-script-check-models
  - scripts-check-models-ts
affects:
  - package.json
  - README.md
tech-stack:
  added:
    - tsx@^4.19.0 (devDependency only — script runner)
  patterns:
    - Read-only inventory script (no src/ imports, no runtime deps)
    - Manually-mirrored KNOWN_DEFAULTS constant vs. live /models responses
    - Graceful per-provider degradation (missing key or fetch error → skipped, never thrown)
    - Family-prefix-gated version comparison for NEW-model detection
key-files:
  created:
    - scripts/check-models.ts
  modified:
    - package.json
    - package-lock.json
    - README.md
decisions:
  - Script lives in scripts/ not src/ so tsc build scope is unchanged (nothing ships in dist/)
  - Native fetch only; tsx is the single new dev-only dep
  - KNOWN_DEFAULTS is a manual mirror with a comment — the script does not import from src/ to keep it standalone
  - Replicate intentionally skipped (no simple listing endpoint); script points user at the public collections page
  - NEW heuristic is stateless and conservative — requires matching family prefix before comparing version numbers
metrics:
  duration: "~12 minutes"
  completed: 2026-04-24
commits:
  - "03647cf feat(260424-h6z-01): add scripts/check-models.ts"
  - "d84d337 chore(260424-h6z-02): wire npm script + README section"
  - "7bfc6aa fix(260424-h6z-03): tighten NEW heuristic to require matching family prefix"
---

# Quick Task 260424-h6z: Add check-models script to detect new image models — Summary

One-liner: Single `npm run check-models` command prints a per-provider image-model inventory comparing live /models responses against hard-coded defaults, with NEW-model flagging and graceful degradation for missing keys or unreachable providers.

## What shipped

1. **`scripts/check-models.ts`** — standalone TS script (no `src/` imports, no runtime deps) that in parallel queries:
   - `GET https://api.openai.com/v1/models` (Bearer)
   - `GET https://generativelanguage.googleapis.com/v1beta/models?key=...`
   - `GET https://api.x.ai/v1/language-models` + `GET https://api.x.ai/v1/image-generation-models` (both Bearer, merged/deduped)
   - `GET https://api.together.xyz/v1/models` (Bearer; `type === 'image'` preferred over keyword heuristic when present)
   - Replicate: always skipped with a pointer to `https://replicate.com/collections/text-to-image`
2. **`package.json`** — new `check-models` script (`tsx scripts/check-models.ts`) + `tsx ^4.19.0` as devDependency. Runtime deps untouched.
3. **`README.md`** — new `### Checking for new models` subsection under Configuration explaining the command, its read-only nature, and the requirement to update `KNOWN_DEFAULTS` when a provider default is bumped in `src/providers/*.ts`.

## Final report shape (smoke run, 2026-04-24)

```
Image model inventory  —  2026-04-24
================================================================

## openai                                       default: gpt-image-2
  [default] gpt-image-2
  [ known ] chatgpt-image-latest
  [ known ] dall-e-2
  [ known ] dall-e-3
  [ known ] gpt-image-1
  [ known ] gpt-image-1-mini
  [ known ] gpt-image-1.5
  [ known ] gpt-image-2-2026-04-21

## gemini                                       default: gemini-2.5-flash-image
  [default] gemini-2.5-flash-image
  [  NEW  ] gemini-3-pro-image-preview
  [  NEW  ] gemini-3.1-flash-image-preview
  [ known ] imagen-4.0-fast-generate-001
  [ known ] imagen-4.0-generate-001
  [ known ] imagen-4.0-ultra-generate-001

## grok                                         default: grok-2-image
  [ known ] grok-imagine-image
  [ known ] grok-imagine-image-pro

## together                                     default: black-forest-labs/FLUX.1-schnell
  skipped: no key

## replicate                                    default: black-forest-labs/flux-1.1-pro
  skipped: no listing endpoint  (browse https://replicate.com/collections/text-to-image manually)

----------------------------------------------------------------
Summary: 2 new models detected across 1 provider.
```

## Reachability with current env

At smoke time the following providers answered successfully:
- **OpenAI** (8 image-capable models listed, including dated variant `gpt-image-2-2026-04-21`)
- **Gemini** (6 image-capable models, including `gemini-3-pro-image-preview`, `gemini-3.1-flash-image-preview`, and the Imagen 4 trio)
- **xAI / Grok** (2 image models: `grok-imagine-image`, `grok-imagine-image-pro`)

Skipped:
- **Together** — `TOGETHER_API_KEY` not set in the shell
- **Replicate** — no listing endpoint (by design)

## Surprises worth noting for future maintenance

- **xAI renamed its image line.** The listing returns `grok-imagine-image` / `grok-imagine-image-pro`, not `grok-2-image` — so the current default doesn't appear in the response and no `[default]` marker shows up in that section. That's the script working correctly: it's flagging drift between the hard-coded default and what xAI actually exposes. Worth evaluating whether to bump `src/providers/grok.ts` defaultModel to `grok-imagine-image` (and updating `KNOWN_DEFAULTS` in lockstep).
- **Gemini has real new models out.** `gemini-3-pro-image-preview` and `gemini-3.1-flash-image-preview` are flagged NEW, plus the Imagen 4 family is now live on the listing endpoint. The preview tag suggests waiting for GA before changing the default, but this is useful signal.
- **OpenAI's `chatgpt-image-latest` alias** is visible in the listing — it tracks whatever ChatGPT is currently using. Not a stable target for a default, but interesting.
- **Together's `type` field** is reliable when present — using it to filter is more precise than the keyword heuristic. The script prefers it when available, falls back to heuristic only when absent.
- **NEW-heuristic iteration:** the initial version tagged `dall-e-3` as NEW vs. `gpt-image-2` default because 3 > 2; fixed in Task 3 by requiring the family prefix (substring before the first digit run) to match before comparing version numbers. Cross-family comparisons now never trigger NEW — a false known is far better than a false NEW for this use case.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] NEW heuristic produced cross-family false positives**
- **Found during:** Task 3 smoke run
- **Issue:** `dall-e-3` was flagged `[  NEW  ]` vs. default `gpt-image-2` because the first-digit comparison returned `3 > 2`, despite the models being different families with unrelated version numbers.
- **Fix:** Added `familyPrefix(id)` helper (substring up to first digit run, lowercased) and changed `isNewer` to return false when `idFamily !== defFamily`. Re-ran smoke: `dall-e-*` models correctly drop to `[ known ]` while genuinely newer `gemini-3-*-image-preview` variants still flag NEW vs. `gemini-2.5-flash-image`.
- **Files modified:** `scripts/check-models.ts`
- **Commit:** `7bfc6aa`

### Out-of-scope observations (not fixed)

- Working tree had pre-existing modifications to `src/providers/openai.ts` (bumping `defaultModel` from `gpt-image-1` to `gpt-image-2`) and to `README.md` (provider-table updates matching that bump), both predating this plan. Not touched by this plan. The Task 3 verify check `git diff --quiet -- src/providers/` would report non-clean purely because of those pre-existing edits — our script is provably read-only and never writes to `src/`.
- `package-lock.json` `npm install` reported 12 pre-existing advisories (1 low, 2 moderate, 8 high, 1 critical). Pre-existing to this plan, not introduced by `tsx`. Out of scope.

## Known Stubs

None. The script is fully wired and produces real data on every code path.

## Reminder for future-Ben

**When you bump a default in `src/providers/*.ts`, update `KNOWN_DEFAULTS` in `scripts/check-models.ts` in the same commit.** The script cannot import from src/ (would pull the MCP SDK at script runtime), so the map is manually synced. A mismatch shows up as "default appears nowhere in the listing" — which is actually useful drift-detection signal, but confusing if you forget.

Candidate next bumps suggested by this run:
- `grok` → `grok-imagine-image` (xAI appears to have renamed — `grok-2-image` is no longer in the listing)
- `gemini` → watch `gemini-3-pro-image-preview` for GA; bump at that point

## Self-Check: PASSED

- `scripts/check-models.ts` exists (414 lines with fix applied → 430).
- `package.json` contains `"check-models"` in scripts and `"tsx"` in devDependencies.
- `package-lock.json` reflects tsx install.
- `README.md` contains `### Checking for new models` subsection.
- All three commits exist in `git log --oneline`: `03647cf`, `d84d337`, `7bfc6aa`.
- `npm run check-models` completes without throwing, renders all five provider sections, and correctly marks defaults/new/known.
- `npm run build` still succeeds; `dist/` contains no `check-models.*` (scripts/ is outside tsconfig `include`).
