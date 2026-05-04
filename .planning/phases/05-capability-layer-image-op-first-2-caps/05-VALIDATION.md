---
phase: 05-capability-layer-image-op-first-2-caps
slug: capability-layer-image-op-first-2-caps
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-04
updated: 2026-05-04
---

# Phase 05 - Validation Strategy

Per-phase validation contract for Nyquist coverage after execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.9 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- tests/capabilities/contract.test.ts tests/capabilities/edit-prompt.test.ts tests/capabilities/registry-quality.test.ts tests/integration/image_op.runs.test.ts tests/integration/image_op.trace.test.ts` |
| Full suite command | `npm test` |
| Build command | `npm run build` |

## Requirement-to-Task Map

| Requirement | Task Surface | Automated Coverage | Status |
|-------------|--------------|--------------------|--------|
| CAP-01: Capability registration without modifying ImageProvider | `src/capabilities/registry.ts`, `src/capabilities/types.ts` | `tests/capabilities/contract.test.ts` | COVERED |
| CAP-02: Extract-only capability via invoke contract | `src/capabilities/extract-subject.ts` | `tests/capabilities/contract.test.ts`, Phase 5 UAT | COVERED |
| CAP-03: Registry routing methods | `src/capabilities/registry.ts` | `tests/capabilities/registry-quality.test.ts` | COVERED |
| CAP-04: Quality scores optional until eval | `src/capabilities/types.ts`, `src/capabilities/registry.ts` | `tests/capabilities/registry-quality.test.ts` | COVERED |
| CAP-05: modelVersion changes invalidate quality | `src/capabilities/registry.ts` | `tests/capabilities/registry-quality.test.ts` | COVERED |
| OP-01..04: `image_op` routing, errors, validation, path output | `src/index.ts`, `src/capabilities/validation.ts` | `tests/integration/image_op.runs.test.ts`, `tests/integration/image_op.trace.test.ts` | COVERED |
| PRIM-01: local `extract_subject` | `src/capabilities/extract-subject.ts` | Phase 5 UAT, integration trace tests | COVERED |
| PRIM-02: OpenAI `edit_prompt` | `src/capabilities/edit-prompt.ts` | `tests/capabilities/edit-prompt.test.ts`, Phase 5 UAT | COVERED |

## Cross-Reference Audit

Phase 5 verification passed 16/16 must-haves. All CAP, OP, and first PRIM requirements are mapped in `.planning/REQUIREMENTS.md` and have code or UAT evidence in `05-VERIFICATION.md` and `05-HUMAN-UAT.md`.

## Validation Audit 2026-05-04

| Metric | Count |
|--------|-------|
| Requirements audited | 11 |
| Gaps found | 0 |
| Resolved by new tests | 0 |
| Existing automated/UAT coverage | 11 |
| Escalated | 0 |

## Verification Results

| Command | Result |
|---------|--------|
| `npm run build` | PASS |
| Targeted Phase 11 debt suite including shared validation regressions | PASS |

## Validation Sign-Off

- [x] All requirements have automated coverage or documented live UAT.
- [x] No Wave 0 validation gaps remain.
- [x] `nyquist_compliant: true` set in frontmatter.

Approval: approved 2026-05-04
