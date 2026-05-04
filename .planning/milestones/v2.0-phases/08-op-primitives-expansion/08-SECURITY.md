---
phase: 08
slug: op-primitives-expansion
status: verified
threats_open: 0
asvs_level: 1
created: 2026-05-03
verified: 2026-05-03
---

# Phase 08 - Security

Per-phase security contract: threat register, accepted risks, and audit trail.

Audit source: Phase 8 has split plans (`08-01-PLAN.md`, `08-02-PLAN.md`) and no standalone `08-PLAN.md` threat model block. This register is derived from the security-relevant plan controls, summary threat flags, verification report, and implementation evidence.

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| MCP request to local capability invocation | User-supplied `image_op` params are validated before capability code runs. | Local file paths, operation params, output paths |
| Data capability to run artifact store | `kind: 'data'` analysis results return JSON and must not write PNG artifacts or user outputs. | Image-derived metadata, OCR text, palette colors |
| Local process to Replicate | `enhance_upscale` sends image bytes to an external provider only when explicitly configured. | Input image base64, scale, face_enhance |
| Tesseract OCR worker pool | OCR uses a long-lived in-process worker per language. | Input image path, OCR text/confidence |
| Capability registry to planner consumers | `list_capabilities` exposes routable metadata used by future planning. | Provider/model/cost/latency/quality metadata |

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-08-01 | Information Disclosure | `image_op` data results | mitigate | `src/index.ts` branches on `result.kind === 'data'` and writes no artifact/output path; `tests/integration/image-op-data-result.test.ts` verifies no `.runs/<runId>/n1.png` or user output file is written. | closed |
| T-08-02 | Denial of Service | `transform` | mitigate | `src/capabilities/transform.ts` caps operation chains at `maxOps=16` and throws `CapabilityInvokeError` before sharp processing; covered by transform capability tests and plan verification. | closed |
| T-08-03 | Denial of Service | `composite_layers` | mitigate | `src/capabilities/validation.ts` and `src/capabilities/composite-layers.ts` cap canvas size at 16MP, layer count at 16, scale at 0.05-10, and post-scale layer size at 16MP before expensive sharp output work. | closed |
| T-08-04 | Denial of Service / Cost Abuse | `enhance_upscale` | mitigate | `src/capabilities/enhance-upscale.ts` rejects input images over 4MP and projected output over 16MP before creating a Replicate prediction; `tests/capabilities/enhance-upscale.test.ts` verifies Replicate is not called on oversized inputs. | closed |
| T-08-05 | Denial of Service | Replicate output fetch | mitigate | `fetchWithTimeoutRetry()` applies a 30s timeout and one retry, then raises retryable `CapabilityInvokeError`; tests cover retry success and final timeout failure. | closed |
| T-08-06 | Security Misconfiguration | Optional provider registration | mitigate | `createEnhanceUpscaleCapability()` returns `null` unless `REPLICATE_API_TOKEN` is usable and rejects `${...}` placeholder values via `resolveOptionalEnv`; tests cover missing and placeholder tokens. | closed |
| T-08-07 | Tampering / Governance | Capability registry quality routing | mitigate | `CapabilityRegistry.register()` requires non-empty `quality.unscoredJustification` when `allowUnscoredProduction=true`; `enhance_upscale` supplies justification and registry tests cover reject/allow paths. | closed |
| T-08-08 | Denial of Service / Race Condition | Tesseract OCR pool | mitigate | `src/utils/ocr.ts` caches one worker per language, serializes same-language recognitions through `queues`, and exposes `terminatePool()` for cleanup; `tests/utils/ocr.test.ts` covers pooling, serialization, and termination. | closed |
| T-08-09 | Repudiation / Retry Safety | Capability errors | mitigate | `CapabilityInvokeError` carries `code`, `retryable`, and optional `suggestion`; `src/index.ts` surfaces structured error payloads for planner retry logic while preserving manifest string errors. | closed |
| T-08-10 | Information Disclosure | Capability discovery | mitigate | `list_capabilities` returns registry metadata without `invoke`, and tests verify metadata-only capability listing. | closed |

Status: open or closed.
Disposition: mitigate (implementation required), accept (documented risk), or transfer (third-party).

## Accepted Risks Log

No accepted risks.

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-05-03 | 10 | 10 | 0 | Codex inline security audit |

## Verification Evidence

| Gate | Result |
|------|--------|
| Input state | State B: no existing `08-SECURITY.md`; split plan and summary artifacts exist; phase execution and verification artifacts exist. |
| Threat flags | `08-01-SUMMARY.md` and `08-02-SUMMARY.md` report no threat flags beyond the plan threat model. |
| Phase verification | `08-VERIFICATION.md` reports passed, 5/5 success criteria, build/test/eval gates passed. |
| Data artifact control | `src/index.ts` data branch omits `artifactPath`, `output`, `finalOutput`; integration test verifies no files are written. |
| Resource caps | Transform, composite, and upscale limits are enforced in capability code and/or shared validation. |
| External provider guardrails | Replicate registration is env-gated, placeholder-safe, megapixel-capped, timeout/retry bounded, and metadata includes `predictionId`. |
| OCR lifecycle | Pooled OCR worker reuse is serialized and has explicit termination support. |
| Registry quality control | Unscored production registration requires an auditable justification. |

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

Approval: verified 2026-05-03
