# Codebase review — 2026-11

RULING — Ben, 2026-11-07: "yes, save the findings then run wrapup"

**Reviewed:** HEAD `3a9089c` (4 read-only specialist agents: SEC+API, REL+LOGIC, ARCH+DEBT+PERF, TEST+DEPS+DX). Commits after `3a9089c` were not part of that review; the fix commits below were reviewed individually where noted.
**Status key:** ✅ lead-verified against code · ❓ agent-reported, not lead-verified (hypothesis).

## Fixed this session

| Finding | Commit |
|---|---|
| SSE server: no Host/Origin check → DNS rebinding could call all tools | `9340462` |
| `budget_cap_usd` summed planner-declared costs (0 passed any cap) — now floored at registry `perCallUsd` | `6929562` |
| Brand-mockup landscape/portrait canvas 1792 px vs gpt-image 1536 px | `04a5920` |
| `process_image` skipped `IMAGE_GEN_INPUT_ROOT` guard | `30d1483` |
| Replicate v1 provider rejected every successful run (SDK `FileOutput` default) | `b0dd5d1` |
| Stacked retries (6 billed calls/node), OpenAI 10-min timeout, unbounded Replicate wait | `5ffcdcd` (adversarially reviewed pre-commit) |
| No CI | `147eab1` |
| Eval scores never reached the running server | `bc7bc4a` |
| `npm test` deleted the real `eval/results/` | `d9a1ddc` |

Out of repo: `~/.image-gen-mcp/secrets.env.bak` was 0644 with API keys → now 0600.

## Open — needs a decision

- ✅ **License — UNRESOLVED, for Ben/counsel.** `package.json` declares `"license": "MIT"`; runtime dependency `@imgly/background-removal-node` declares `"SEE LICENSE IN LICENSE.md"`, and that file's first line is `# GNU Affero General Public License`. No determination made.
- **SSE token auth.** Host/Origin guard blocks browsers; any local process can still connect. Blocked on knowing which clients use `:3101`.

## Open — code

- ✅ `npm audit --omit=dev`: 30 advisories (9 moderate, 18 high, 3 critical; critical chains via `protobufjs`/@google/genai, `proxy-addr`/express, `tar`/node-gyp+onnxruntime). MCP SDK fixable by lockfile refresh within range. Reachability per chain not verified.
- ✅ 6 `.catch(() => {})` in `src/index.ts` (+ retention sweep ❓) swallow errors.
- ❓ Replicate SDK `withAutomaticRetries` re-POSTs on network errors/429 → possible duplicate billed predictions (`enhance_upscale`, `generate:replicate`).
- ❓ Gemini calls have no app-level timeout.
- ❓ Planner can set `edit_prompt` `max_retries: 10` / `timeout_ms: 300000` (plan params are `z.record(z.unknown())`).
- ❓ grok/together `AbortSignal.timeout` surfaces as `PROVIDER_FAILURE`, not `TIMEOUT`.
- ❓ Adapters mark every error retryable incl. 4xx; HTTP 404 labelled `TIMEOUT`.
- ❓ `dry_run` reports Haiku's self-declared total; failed nodes report `cost_usd: 0` after billed attempts; `upscale-export` template declares flat $0.005 for per-MP pricing (budget floor does not model per-MP).
- ❓ One artifact-write failure discards the whole `image_task` trace including paid results.
- ❓ `generate_batch` + `reference_image` still requires the default v1 provider and drops `size` for grok; reference branch duplicated between `src/index.ts` and `src/batch.ts`.
- ❓ `grok-generate` advertises landscape/portrait; `GrokProvider.supportsSize = false`.
- ❓ `batch.ts` fixed chunks, not a pool.
- ❓ No output-path containment (any `*.png` overwritten, recursive mkdir).
- ❓ `src/index.ts` 1,400+ line god module; v1/v2 helper drift (documented decision to keep both registries — fix with shared helpers, not a merge).
- ❓ Unused runtime deps `node-gyp`, `node-addon-api`, `@types/pixelmatch`; `postinstall` runs `tsc` (devDep) → `--omit=dev` install likely fails.
- ❓ Untested: 5 v1 providers, `*-generate` wrappers, `utils/processing.ts`, `utils/image.ts`, `process_image`, `generate_asset`.
- No pre-commit hook mirroring CI.

## Open — docs

- ✅ `CLAUDE.md` says every `generate_batch` item retries 2×; only the `reference_image` path retries (edit_prompt's internal loop).
- ❓ `docs/DESIGN.md` lists stale Gemini/Grok defaults.
- `scripts/check-models.js` is an untracked stale compiled copy of `check-models.ts`.

## Eval baseline (`eval/results/2026-11-08T00-39-33-815Z.json`, gitignored)

12 scored, 5 skipped (no `FAL_KEY` / `IDEOGRAM_API_KEY` / `PHOTOROOM_API_KEY`). Every scored op has a single scored provider, so routing has no comparisons yet. `edit-text-label` scored `pixel_delta=0.986` vs 0.14–0.22 for other edits — scorer direction not checked.
