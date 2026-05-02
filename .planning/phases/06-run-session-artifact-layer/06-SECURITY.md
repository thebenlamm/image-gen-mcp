---
phase: 06
slug: run-session-artifact-layer
status: verified
threats_open: 0
asvs_level: 1
created: 2026-05-02
---

# Phase 06 - Security

Per-phase security contract: threat register, accepted risks, and audit trail for the run/session artifact layer.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| User to MCP tool params | Untrusted `image_op` strings flow into handler inputs and manifests. | `op`, `provider`, `params`, `outputPath`, `outputDir`; prompt text and local file paths |
| Handler to filesystem | `image_op` writes run artifacts under `<outputDir>/.runs/<runId>/`. | PNG buffers, `manifest.json`, trace paths |
| Filesystem to retention sweep | Startup sweep walks `.runs` and deletes expired run directories. | Directory names, mtimes, symlink metadata |
| Env to retention parser | `IMAGE_GEN_RUN_RETENTION_HOURS` controls retention age. | Untrusted environment string |
| Module import to process lifecycle | Test and tooling imports must not start the MCP transport. | `import.meta.url`, `process.argv[1]` |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-06-01 | Tampering | runId path traversal | mitigate | `runId` is server-generated, regex-validated, path-resolved, and containment-checked before `mkdir`. Evidence: `src/runs/id.ts`, `src/runs/dir.ts:19`. | closed |
| T-06-02 | Tampering | Symlink attack on `.runs/<runId>/` during sweep | mitigate | Sweep filters non-directories, symlinks, and invalid run IDs before removal, then uses `lstat` before `rm`. Evidence: `src/runs/retention.ts:52`. | closed |
| T-06-03 | Tampering | Sweep deletes user data outside `.runs` | mitigate | Sweep root is resolved from configured output dir, joins only validated run IDs beneath that root, and never removes the root itself. Evidence: `src/runs/retention.ts:38`, `src/runs/retention.ts:62`, `src/runs/retention.ts:68`. | closed |
| T-06-04 | Tampering | TOCTOU between stat and rm | accept | Accepted as startup-only, idempotent sweep behavior; `fs.rm(..., force: true)` handles missing entries and per-entry errors are recorded. Evidence: `src/runs/retention.ts:52`, `src/runs/retention.ts:78`. | closed |
| T-06-05 | DoS | Disk-space exhaustion if retention disabled or sweep crashes | mitigate | Default retention is 24h; invalid values fall back to default; sweep is fail-soft and returns `SweepResult` errors rather than throwing. Evidence: `src/runs/retention.ts:5`, `src/runs/retention.ts:7`, `src/runs/retention.ts:31`. | closed |
| T-06-06 | Information Disclosure | Manifest stores user prompt and file paths in plaintext | accept | Accepted for personal-MCP scope; manifest is stored locally under the user's configured output directory and is not transmitted. | closed |
| T-06-07 | Tampering | Invalid retention env var causes silent retention growth | mitigate | Parser requires finite, non-negative numbers and logs/falls back to 24h on invalid input. Evidence: `src/runs/retention.ts:13`, `tests/runs/retention.test.ts:35`. | closed |
| T-06-08 | Tampering | Non-atomic JSON manifest writes corrupt readers | mitigate | `writeManifest` serializes JSON then delegates to `writeFileAtomic` tmp-plus-rename writes. Evidence: `src/runs/manifest.ts:35`, `src/runs/write.ts:3`. | closed |
| T-06-09 | Tampering | Manifest stores raw `params.input` and `params.prompt` | accept | Accepted for personal-MCP reproducibility/debugging; manifest is local and user-owned. Evidence: `src/runs/manifest.ts:21`, `src/index.ts:500`. | closed |
| T-06-10 | Information Disclosure | Capability error message may leak secrets into manifest/trace | mitigate | Error handling records `error.message`/`String(error)` only and does not add stack traces. This preserves the existing Phase 5 error surface. Evidence: `src/index.ts:650`, `src/index.ts:661`. | closed |
| T-06-11 | DoS | Crash mid-write leaves `<runDir>/n1.png.tmp` orphan | mitigate | Node artifact writes use `writeFileAtomic`, which cleans tmp files on write/rename failure; an in-progress manifest is written before capability invocation. Evidence: `src/index.ts:509`, `src/index.ts:592`, `src/runs/write.ts:11`. | closed |
| T-06-12 | Tampering | Sweep deletes a run dir during another image operation | mitigate | Retention sweep runs in `main()` before transport connection; code documents the no-in-flight invariant. Evidence: `src/index.ts:741`, `src/index.ts:827`. | closed |
| T-06-13 | Tampering | Sweep failure on startup crashes server | mitigate | Startup sweep is wrapped in try/catch and logs non-fatal failures before continuing to transport setup. Evidence: `src/index.ts:744`. | closed |
| T-06-14 | Information Disclosure | Trace `output` path leaks user home directory | accept | Accepted as existing Phase 5 behavior; output paths are local paths chosen by the user or derived from the user's configured output directory. | closed |
| T-06-15 | DoS | Importing `src/index.ts` triggers `main()` and blocks/exits tests | mitigate | `main()` is gated by `isDirectInvocation` using `pathToFileURL(process.argv[1])`; tests import `handleImageOp` directly. Evidence: `src/index.ts:833`, `tests/integration/image_op.runs.test.ts:7`. | closed |

Status: open = unresolved mitigation gap; closed = mitigation found, accepted risk documented, or transfer documented.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-06-01 | T-06-04 | Startup-only retention sweep is idempotent; TOCTOU deletion races are bounded to local filesystem churn and handled with `force: true` plus per-entry error capture. | Codex security audit | 2026-05-02 |
| AR-06-02 | T-06-06 | Prompt text and paths in manifests are acceptable for a personal MCP because artifacts remain in the user's own output directory and are not transmitted. | Codex security audit | 2026-05-02 |
| AR-06-03 | T-06-09 | Raw invocation params are useful for reproducibility/debugging and remain local; this mirrors the Phase 6 research decision for personal-MCP scope. | Codex security audit | 2026-05-02 |
| AR-06-04 | T-06-14 | Returning local output paths is pre-existing user-facing behavior and not a new Phase 6 disclosure surface. | Codex security audit | 2026-05-02 |

---

## Verification Evidence

| Evidence | Result |
|----------|--------|
| `src/runs/dir.ts` | Run IDs are regex-validated, path-resolved, containment-checked, and node IDs reject traversal. |
| `src/runs/retention.ts` | Retention parser validates env input; sweep skips symlinks/non-run IDs, deletes only validated run dirs, and records per-entry errors. |
| `src/runs/write.ts` and `src/runs/manifest.ts` | PNG and manifest writes use tmp-plus-rename atomic writes with best-effort tmp cleanup. |
| `src/index.ts` | `image_op` writes an in-progress manifest first, finalizes success/error manifests, uses atomic artifact writes, runs retention before transport connect, and guards `main()` on direct invocation. |
| `tests/runs/retention.test.ts` | Covers invalid env fallback, symlink skip, non-run sibling preservation, missing `.runs`, and retention `0` delete-all behavior. |
| `tests/integration/image_op.runs.test.ts` | Covers success artifact/manifest, missing-capability error manifest, thrown-capability error manifest, and sweep deletion. |
| `tests/integration/image_op.trace.test.ts` | Locks Phase 6 trace shape and verifies multi-node compatibility. |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-05-02 | 15 | 15 | 0 | Codex |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-05-02
