# Phase 8: Op Primitives Expansion - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-02
**Phase:** 08-op-primitives-expansion
**Areas discussed:** Analyze ops return shape, composite_layers param schema, transform vs process_image, enhance_upscale model + budget, plan split

---

## Approach: proposal-then-adversarial-review

Rather than 4-question-per-area interactive turns, the user requested a single proposal across all four gray areas, then asked for two independent adversarial reviews:
1. **zed-velocity-engineer** — pragmatic ship-fast lens
2. **general-purpose** (senior-staff API designer lens) — contract durability + Phase 9 ergonomics

The decisions in CONTEXT.md are the synthesis of the original proposal plus accepted pushbacks from both reviews.

---

## Area 1 — Analyze ops return shape

| Option | Description | Selected |
|--------|-------------|----------|
| Extend with optional fields | `{ buffer?, data?, ... }` with "exactly one of" runtime check | |
| Pretend it's a file | JSON-encode result as a buffer, save with `.json` extension | |
| Tiny placeholder PNG + metadata | Return 1×1 transparent PNG, stuff data in `metadata` | |
| **Discriminated union with tagged inner types** | `kind: 'image' \| 'data'` outer tag + `type` discriminant on each result interface | ✓ |

**User's choice:** Discriminated union with tagged inner types (D-01..D-06)
**Notes:** First proposal was `buffer? | data?` optional fields. Zed pushed for a discriminated union on `kind`. The second reviewer caught that even with `kind`, the inner `data: A | B | C` union does not narrow — needs an inner `type` discriminant on each result interface for TypeScript to actually enforce the shape. Final shape closes both runtime and type-safety holes. Also locked: `metadata` is invocation telemetry only (D-03); existing 2 caps get codemodded explicitly (D-04); `image_op` ignores `outputPath` for `kind: 'data'` and trace `artifactPath` is `null` (D-05); analyze result interfaces are public contract from day one (D-06).

---

## Area 2 — composite_layers param schema

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit and verbose | Required canvas + per-layer `{x, y, scale?, rotate?, blend?}` | |
| Smart defaults | `{ layers: [path1, path2] }` with auto-canvas + auto-center | |
| **Explicit canvas with sugar where unambiguous** | Required canvas, optional anchor sugar, hard caps on layer count / scale / canvas MP | ✓ |

**User's choice:** Explicit canvas with sugar (D-14..D-19)
**Notes:** Auto-detected canvas felt magical and would make the planner's output unpredictable. Anchors stayed in v1 (against Zed's pushback) because the planner emits JSON without knowing layer dimensions — anchor sugar lets it say "center this" without an extra `analyze_dimensions` round-trip. Second reviewer caught real OOM vectors (no layer-count cap, unbounded scale, `string | 'transparent'` is a type lie that collapses) — all three closed in D-17 and the corrected `background` shape in D-14. Also locked: single `sharp(canvas).composite([...])` call to avoid serializing through libvips concurrency cap of 2 (D-18).

---

## Area 3 — transform vs process_image

| Option | Description | Selected |
|--------|-------------|----------|
| **Wrap the chain — one cap, full chain** | `transform` cap is a ~10-line shim over `applyOperations(buffer, ProcessingOperation[])` | ✓ |
| One op per cap call | `transform` only takes ONE op per call; planner composes nodes | |
| Split into multiple caps | `resize`, `crop`, `circle_mask` each become their own capability | |

**User's choice:** Wrap the chain (D-10..D-13)
**Notes:** Zero divergence with the v1.0 `process_image` MCP tool because they share `applyOperations`. The atomic-ops version sounded appealing for trace clarity but pays for it in disk I/O and doesn't unlock anything the planner can't already do (it can emit multiple `transform` nodes each with a single-op chain). Second reviewer added: cap chain length at 16 (D-12, real DoS vector for a planner emitting a 50-step chain), pipe `applyOperations` result info into `metadata` (D-13, free observability), and rehome `ProcessingOperation` to one canonical location (D-11, prevents drift between processing.ts and capability code).

---

## Area 4 — enhance_upscale model + budget

| Option | Description | Selected |
|--------|-------------|----------|
| **`nightmareai/real-esrgan`, 2x default, face_enhance off, dual MP cap** | Most popular Replicate fork, $0.0023/run, conservative defaults, hard caps on input AND output megapixels | ✓ |
| `philz1337x/clarity-upscaler` | Fancier, more "creative" upscaling, ~$0.05/run | |
| Other Real-ESRGAN fork (`lucataco/real-esrgan`) | Equivalent functionality, less battle-tested | |

**User's choice:** `nightmareai/real-esrgan` (D-20..D-26)
**Notes:** Default scale 2x (4x is opt-in, prevents accidental cost blowups). Zed caught `face_enhance: false` default (Real-ESRGAN hallucinates faces on logos/products) and that we need to cap **input** megapixels too, not just output (a 4MP × 4x = 64MP and Replicate bills regardless). Second reviewer added Replicate URL fetch hardening (timeout + retry + `predictionId` in metadata, D-24), `cost.perMegapixelUsd` instead of `perCallUsd` (D-25, real-esrgan price scales with output), and `quality.unscoredJustification` requirement when `allowUnscoredProduction: true` (D-09, audit trail). Defer: SSIM bicubic-roundtrip sanity scorer (over-engineering for Phase 8).

---

## Area 5 — Cross-cutting / forward-compat decisions

| Option | Description | Selected |
|--------|-------------|----------|
| Ship Phase 8 minimal — defer planner-prep to Phase 9 | Strip `list_capabilities`, `CapabilityInvokeError`, `idempotencyKey?` reservation | |
| **Phase-9-proof Phase 8** | Land structured error class, idempotency-key reservation, list_capabilities MCP tool, OCR worker pooling, drop unused `generate` enum entry — all in Phase 8 to prevent Phase 9 rewrites | ✓ |

**User's choice:** Phase-9-proof Phase 8 (D-07, D-08, D-31..D-37)
**Notes:** The user explicitly framed the goal as "get the contract right *now* so Phase 9 doesn't require a rewrite of every capability." Trade-off: Phase 8 surface grows from "6 capabilities" to "6 capabilities + contract refactor + structured errors + introspection tool + OCR pooling + enum hygiene." Both reviewers agreed this is the correct trade — every item rejected from Phase 8 would have triggered a contract break or partial rewrite in Phase 9.

---

## Area 6 — Plan split

| Option | Description | Selected |
|--------|-------------|----------|
| 3 plans (original proposal) | 08-01 contract+transform+analyze ops; 08-02 composite; 08-03 upscale+ocr | |
| **2 plans** | 08-01 contract + transform + analyze_dimensions/palette + list_capabilities; 08-02 composite + upscale + analyze_ocr + OCR utils + remaining eval | ✓ |

**User's choice:** 2 plans (D-40)
**Notes:** Zed correctly identified that the contract change in 08-01 is the only sequencing dependency; everything in 08-02 is independent capabilities (no shared code between composite, upscale, and OCR). Splitting them buys nothing. Confirmed by the second reviewer.

---

## Claude's Discretion

The following implementation details are explicitly delegated to the planner/executor (D-41 + Decisions §"Claude's Discretion"):

- File layout under `src/capabilities/` for the 6 new caps (likely one file per cap mirroring existing pattern)
- Exact Zod schemas for each cap's params (driven by the typed contracts in D-01..D-30)
- Test naming/structure under Vitest 2.x (mirror Phase 6/7 conventions)
- Whether `list_capabilities` filters fields by exclusion or by an explicit serializer
- Real-ESRGAN-specific Replicate input parameters (`tile`, `tile_pad`, `pre_pad`) — read the model schema and use sensible defaults; only `scale` and `face_enhance` exposed at the capability surface

---

## Deferred Ideas

Captured in CONTEXT.md `<deferred>` section:

- Rotation and arbitrary blend modes on `composite_layers` (forward-compatible additions)
- Layer `input` accepting Buffer instead of file paths (Phase 9 problem if disk I/O becomes a bottleneck)
- Per-backend concurrency budgets — sharp/tesseract/Replicate (Phase 9 DAG executor owns this)
- SSIM bicubic-roundtrip sanity scorer for upscale (future eval phase)
- `traceId` on `CapabilityInvokeParams` (add when there's an actual logging consumer)
- Wiring `generate` as a capability (Phase 11 when providers register it)
- Pooled OCR worker eviction policy (one cached worker per language for now)
- Multi-language OCR in one call (one language per invocation for now)
- Pre-multiplied alpha edge cases on composite (sharp handles internally; expose knob if planner needs it)
