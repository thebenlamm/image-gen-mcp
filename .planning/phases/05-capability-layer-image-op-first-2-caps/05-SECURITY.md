---
phase: 05-capability-layer-image-op-first-2-caps
audit_date: 2026-05-01
asvs_level: 1
block_on: high
threats_total: 10
threats_closed: 10
threats_open: 0
status: SECURED
---

# Phase 05 Security Audit

**Phase:** 05 — capability-layer-image-op-first-2-caps
**Threats Closed:** 10/10
**ASVS Level:** 1
**Block-on:** high

This audit verifies declared mitigations from the threat models in
`05-01-PLAN.md`, `05-02-PLAN.md`, and `05-03-PLAN.md` against the implemented
code. Implementation files were not modified; only this document was created.

## Threat Verification

| Threat ID | Category | Disposition | Evidence |
|-----------|----------|-------------|----------|
| T1 | Information Disclosure (path-traversal / local file access) | accept (deferred-by-design) | See "Accepted Risks" below. Phase 5 plan 05-02 explicitly accepts explicit local file paths for this personal MCP tool. Capabilities validate inputs as non-empty strings (`src/capabilities/extract-subject.ts:33-35`, `src/capabilities/edit-prompt.ts:52-58`) but do not sandbox paths. |
| T2 | Tampering (provider files must not be mutated) | mitigate | `git log ce75ace^..HEAD --name-only -- 'src/providers/*'` returned zero entries for the phase commit range. `src/providers/index.ts` and all `src/providers/*.ts` files are unchanged by the phase. |
| T3 | Tampering (stale quality scores on modelVersion change) | mitigate | `src/capabilities/registry.ts:11-13` — when an existing entry's `modelVersion` differs from the incoming, `incoming.quality = undefined` before storing. |
| T4 | Information Disclosure (file path error must not echo contents) | mitigate | `src/capabilities/extract-subject.ts:34` throws `"extract_subject requires params.input file path"`; `src/capabilities/edit-prompt.ts:53` and `:57` throw `"edit_prompt requires params.input file path"` and `"edit_prompt requires params.prompt"`. `fs.promises.readFile` errors propagate as native `ENOENT/EACCES` errors carrying only the filename — no buffer contents are interpolated into messages. `validateCapabilityParams` in `src/capabilities/validation.ts` likewise emits messages free of file contents. |
| T5 | Integrity (no partial output on provider failure) | mitigate | `src/capabilities/edit-prompt.ts:75-103` — input read and `fetch` happen inside `invoke`; on non-OK response the function throws before returning a buffer. `src/index.ts:462,469` — `saveImage(result.buffer, filePath)` is called only after `capability.invoke` resolves successfully; thrown errors fall to the catch at `src/index.ts:493` and never write a file. |
| T6 | Tampering (capabilities return buffers only; saving owned by image_op) | mitigate | `src/capabilities/extract-subject.ts:40-44` and `src/capabilities/edit-prompt.ts:107-112` return `{ buffer, model, ... }`. Neither file imports `saveImage` or `fs.writeFile`. The only `saveImage(...)` call for `image_op` lives in `src/index.ts:469`. |
| T7 | Spoofing (unregistered op/provider must fail before invocation) | mitigate | `src/index.ts:444-457` — `capabilityRegistry.get(op, provider)` runs first; if undefined, the handler returns the `"Capability not registered for op '${op}' and provider '${provider}'"` JSON response **before** the `try` block at `:459` that contains `validateCapabilityParams` and `capability.invoke`. No network or local-model call is reachable on this path. |
| T8 | DoS (constraint violations must fail before invocation) | mitigate | `src/index.ts:460` calls `validateCapabilityParams(capability, params)` immediately before `capability.invoke` at `:462`. `src/capabilities/validation.ts:7-37` validates `requiresInputImage`, `edit_prompt` prompt presence, `maxPromptLength` (4000), and `supportedSizes`. Each violation throws synchronously, hitting the catch at `src/index.ts:493` before any provider call. |
| T9 | Information Disclosure (response file paths only, no base64) | mitigate | `src/index.ts:471-491` success response includes `output: filePath`, `runId`, and `trace.nodes[].output: filePath`; no `b64_json` field. Error response at `:495-512` carries `error`, `runId`, and trace metadata only. Grep for `b64_json` in `src/index.ts` returns no matches inside the `image_op` handler block. |
| T10 | Integrity (runId is metadata only) | mitigate | `src/index.ts:443` generates `runId` from timestamp + `crypto.randomBytes(3)`. The handler does not call `mkdir`, `mkdtemp`, or any directory creation tied to `runId`; `runId` is only written into the response JSON. Persistent run directories remain deferred to Phase 6 as documented. |

## Accepted Risks

### T1 — Path traversal / arbitrary local file access via `params.input`

- **Disposition:** accepted by design for Phase 5 (personal MCP tool).
- **Source:** `05-02-PLAN.md` `<threat_model>` — *"Local input image paths can expose arbitrary files if the caller passes sensitive paths. For this personal MCP tool, Phase 5 accepts explicit local paths by design, but errors must identify missing/unreadable files without echoing file contents."*
- **Implementation behavior:** `src/capabilities/extract-subject.ts:31-37` and `src/capabilities/edit-prompt.ts:49-75` accept any string path provided in `params.input` and pass it to `removeBackground` / `fs.promises.readFile` without sandboxing or canonicalization checks against an allow-listed directory. The MCP server runs in the user's process with the user's filesystem permissions, so the caller (Claude Code, a local MCP client) is already trusted with that scope.
- **Compensating constraint verified (T4):** error messages do not echo file contents.
- **Re-evaluate when:** the MCP server is exposed to untrusted callers (multi-user, networked, hosted), or when Phase 6 introduces persistent run artifacts that may broaden filesystem reach. At that point, T1 must be re-opened and an explicit sandbox or allow-list mitigation added.

## Unregistered Flags

None. SUMMARY.md `## Threat Flags` for plans 05-01, 05-02, and 05-03 each explicitly state `None`. No new attack surface was reported by the executor that lacks a registered threat mapping.

## Audit Notes

- **Provider isolation (T2) verification command:**
  ```
  git log ce75ace^..HEAD --name-only -- 'src/providers/*'
  ```
  returned no output. The phase's commits (`ce75ace`, `acf0fd1`, `84e8ce2`,
  `db477ff`, `fd14a01`, `4beddda`, `bd78895`, `27031b3`, `5c128db`, plus
  follow-up fix and docs commits) modify only `src/capabilities/*`,
  `src/index.ts`, `package.json`, `package-lock.json`, and planning docs.
- **OpenAI request shape note:** `src/capabilities/edit-prompt.ts:75-91` reads
  the input file and base64-encodes it into a JSON request to
  `https://api.openai.com/v1/images/edits`. This is in-scope for T1 (accepted)
  and does not affect any other threat. The base64 encoding is outbound to
  OpenAI only; the MCP response (T9) does not include base64 image data.
- **No implementation changes were made by this audit.** Only this SECURITY.md
  was created.

---
*Audit completed: 2026-05-01*
*Next re-audit trigger: any change to capability input handling, addition of
remote/multi-user surface, or Phase 6 persistent run artifact wiring.*
