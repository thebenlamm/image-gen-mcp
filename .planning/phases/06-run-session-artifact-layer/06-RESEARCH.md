# Phase 6: Run/Session Artifact Layer - Research

**Researched:** 2026-05-01
**Domain:** Node.js filesystem persistence, atomic writes, retention sweeps, forward-compatible trace contracts
**Confidence:** HIGH

## Summary

Phase 6 introduces persistent run artifacts under `<outputDir>/.runs/<runId>/` and a retention sweep at server startup. The technical surface is small and self-contained: no new external dependencies, no new providers, no new MCP tools. The work is concentrated in a new `src/runs/` module, a small refactor of `image_op` in `src/index.ts`, and a startup-time sweep wired into `main()`.

The single most important design decision is the **trace shape**, because Phase 9 (`image_task` with multi-node DAG) will reuse it. Phase 5 already returns a trace with a `nodes` array containing one node — the Phase 6 contract must keep that shape and only enrich each node (adding `runId` per-response, `artifactPath`, `outcome`, `startedAtMs`, `endedAtMs`, `durationMs`, `cost_usd`). No reshape later.

The runId format is the second most important decision because it's user-visible, embedded in directory names, and must be cross-platform safe. The recommendation is to keep the **existing Phase 5 format** (`run-<ISO-with-colons-replaced>-<6-hex-char>`) because it is already shipped, sortable, filesystem-safe, and not worth breaking. Switching to ULID/UUIDv7 is **not recommended** for a personal MCP — they add no value over the current format and break the existing user-facing surface.

**Primary recommendation:** Build a small `src/runs/` module owning runId generation, run-dir resolution, atomic node-artifact writing, manifest authoring, and retention sweep. Wire it into `image_op` (Phase 6) and design it so Phase 9 multi-node executors call the same primitives without modification. Run sweep on startup only (per RUN-04); no periodic timer.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| runId generation | Run module (`src/runs/id.ts`) | — | Single deterministic source; called by tool layer before invocation |
| Run directory resolution | Run module (`src/runs/dir.ts`) | Output utils (`src/utils/image.ts` for outputDir base) | Resolves `<outputDir>/.runs/<runId>/`; mkdir recursive |
| Atomic node artifact write | Run module (`src/runs/write.ts`) | — | tmp + rename per file; reuses pattern from `saveImage` |
| Manifest authoring | Run module (`src/runs/manifest.ts`) | — | JSON manifest co-located with node artifacts |
| Trace shape construction | Tool layer (`src/index.ts` image_op handler) | Run module (provides node entry helper) | Tool owns response; module exposes typed builders |
| Retention sweep | Run module (`src/runs/retention.ts`) | Server startup (`main()` in `src/index.ts`) | Pure FS scan; called once before transport connects |
| Capability invocation | Capability module (existing) | — | Capabilities still return Buffer; persistence is owned by tool layer |

## User Constraints

No `CONTEXT.md` exists for Phase 6. Constraints are derived from `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, and `CLAUDE.md`:

### Project Constraints (from CLAUDE.md and STATE.md)
- **TypeScript** with `nodenext` module resolution (`.js` import suffixes for relative imports).
- **PNG only** for image output (already enforced in `saveImage`).
- **Atomic writes** (tmp + rename) for files read by multiple processes — *already a documented project pattern in `STATE.md`*.
- **Buffer-in / Buffer-out** processing pattern; capabilities return `Buffer`, not paths.
- **Path priority preserved**: `outputPath > outputDir > IMAGE_GEN_OUTPUT_DIR > ~/Downloads/generated-images`. Run dirs must derive from the same outputDir base, not from a per-call `outputPath`.
- **No new top-level providers**; capability layer is parallel to `ImageProvider`. Phase 6 must not modify `src/providers/*.ts`.
- **Trace returns paths only, never base64** (locked decision; carried through from Phase 5 and reaffirmed for Phase 9 SC#5).
- **`generate_asset` is NOT deprecated**; v1.0 tools (`generate_image`, `process_image`, `generate_asset`) remain unchanged. Phase 6 only adds run artifacts to the v2.0 surface (`image_op`, future `image_task`).
- **Defensive programming** (null checks, default values, guard clauses) and **never swallow exceptions** (use `logger.error()` with context — though this codebase uses `console.error` only, see Common Pitfalls).
- **Surgical changes**: do not "improve" adjacent code as drive-by refactor.

### Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RUN-01 | Each task invocation generates a unique `runId` (timestamp + random hex) | "runId Format" section — keep existing Phase 5 format, formalize generator |
| RUN-02 | Intermediate artifacts saved to `<outputDir>/.runs/<runId>/n<nodeId>.png` via atomic write (tmp + rename) | "Atomic Writes" section — extends existing `saveImage` pattern |
| RUN-03 | `IMAGE_GEN_RUN_RETENTION_HOURS` env var controls cleanup (default 24) | "Env Var Parsing" section |
| RUN-04 | Retention sweep runs at server startup; deletes runs older than threshold | "Retention Sweep" section — mtime-based, fail-soft, one-shot |
| RUN-05 | `image_op` and `image_task` return `runId` in response so users can locate intermediates | Phase 5 already includes `runId` in response; carry forward and add `runId` to each trace node |

## Standard Stack

### Core (all already installed — no new deps)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:fs/promises` | built-in (Node 22) | mkdir, writeFile, rename, readdir, stat, rm, utimes | Native — no dependency surface |
| `node:crypto` | built-in (Node 22) | `randomBytes(6).toString('hex')` for runId entropy | Phase 5 already uses this for runId; consistent |
| `node:path` | built-in | path.join / path.resolve / path.dirname for run dir layout | Already used throughout `src/utils/image.ts` |

### Supporting (already installed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | ^3.25.76 | Manifest schema validation if useful | Optional — manifest is server-written, server-read; runtime validation is low-value |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Existing Phase 5 runId format | `ulid` package | ULID is shorter, more human-friendly, but adds a dependency for zero functional gain. Phase 5 format already shipped and sortable. Keep it. |
| Existing Phase 5 runId format | UUIDv7 (`uuid` package v9+) | Standard, sortable, but breaks an already-shipped user-visible identifier. No reason to migrate. |
| Hand-rolled atomic write | `write-file-atomic` (npm) | Adds a dependency for a 3-line pattern that's already in `saveImage`. Reuse the existing pattern. |
| Hand-rolled retention sweep | `tmp` / `rimraf` packages | Sweep is ~30 lines; both packages are overkill. `fs.promises.rm({ recursive: true, force: true })` (Node 14.14+) is sufficient. |
| Manifest in `manifest.json` | SQLite / JSON-lines log | A personal MCP doesn't need a query layer. JSON file co-located with artifacts is the simplest correct option. |

**Installation:** No new packages. Phase 6 is **zero-dependency** by design.

**Version verification:** [VERIFIED: local `node --version`] Node v22.14.0 in dev environment. `fs.promises.rm` requires Node 14.14+; widely available. All Node APIs used are stable.

## Architecture Patterns

### System Architecture Diagram

```
                        ┌──────────────────────────┐
   user invokes         │  image_op MCP handler    │  (src/index.ts)
   image_op  ─────────► │  (existing in Phase 5)   │
                        └──────────┬───────────────┘
                                   │
                  1. createRunId() ▼
                  2. resolveRunDir(outputDir)
                  3. validateCapabilityParams
                                   │
                                   ▼
                        ┌──────────────────────────┐
                        │  capability.invoke(...)  │  ← existing Phase 5
                        │  returns Buffer + model  │
                        └──────────┬───────────────┘
                                   │
              4. writeNodeArtifact ▼  (atomic tmp+rename)
                                   │      writes:
                                   │      <runDir>/n1.png
                                   │      <runDir>/manifest.json
                                   │
                  5. resolveOutputPath (existing)
                  6. saveImage to user-facing path (existing)
                                   │
                                   ▼
                        ┌──────────────────────────┐
                        │   Trace builder          │
                        │   {runId, nodes[…]}      │
                        └──────────┬───────────────┘
                                   │
                                   ▼
                            JSON response


   Server startup (one-shot):

   main() ──► sweepRunArtifacts(retentionHours)
              │
              ▼
   scans <outputDir>/.runs/*, stats each, rm -rf if mtime < cutoff
```

Two flows: per-call (image_op handler) and per-startup (`main()` sweep). Capability invocation is unchanged from Phase 5; the new layer wraps before/after.

### Recommended Project Structure

```
src/
├── runs/                  # NEW — Phase 6 module
│   ├── index.ts           # Barrel exports
│   ├── id.ts              # createRunId() + format
│   ├── dir.ts             # resolveRunDir(), runArtifactPath()
│   ├── manifest.ts        # writeManifest(), ManifestSchema type
│   ├── write.ts           # writeNodeArtifact() — atomic
│   ├── retention.ts       # sweepRunArtifacts(), parseRetentionHours()
│   └── trace.ts           # buildTraceNode() helper, Trace + TraceNode types
├── capabilities/          # unchanged
├── providers/             # unchanged
├── utils/
│   └── image.ts           # unchanged (resolveOutputPath, saveImage stay)
└── index.ts               # MODIFIED — image_op uses runs module; main() calls sweep
```

### Pattern 1: Atomic Single-File Write (already established)
**What:** Write to `<path>.tmp`, then `fs.promises.rename(tmp, path)`.
**When to use:** Every artifact write under `.runs/<runId>/`. Reuse the same pattern as `saveImage`.
**Example:**
```typescript
// Source: src/utils/image.ts (existing, lines 109-114) — verified pattern
export async function saveImage(buffer: Buffer, filePath: string): Promise<string> {
  const tmpPath = `${filePath}.tmp`;
  await fs.promises.writeFile(tmpPath, buffer);
  await fs.promises.rename(tmpPath, filePath);
  return filePath;
}
```

For Phase 6, generalize this — `writeNodeArtifact` and `writeManifest` should both call a shared `writeFileAtomic(path, data)` helper rather than each duplicating the pattern. (Or, equivalently, export `saveImage` as the buffer variant and add `writeFileAtomic` for JSON.)

### Pattern 2: Forward-Compatible Trace Shape
**What:** Trace is `{ runId, nodes: TraceNode[] }`. Each node is self-describing. Phase 6 always emits one node; Phase 9 emits N nodes from a DAG, same shape.
**When to use:** Every `image_op` response and every future `image_task` response.

```typescript
// Recommended — Phase 6 trace contract
export interface TraceNode {
  id: string;                    // 'n1', 'n2', ... — DAG node id
  op: CapabilityOp;
  provider: string;
  model?: string;                // capability.modelVersion or invoke result.model
  artifactPath?: string;         // <runDir>/n<id>.png — Phase 6 NEW
  output?: string;               // user-facing saved path (for the FINAL node only — see "Final node convention")
  startedAtMs: number;           // epoch ms — Phase 6 NEW (Phase 9 needs for parallelism debug)
  endedAtMs: number;             // epoch ms — Phase 6 NEW
  durationMs: number;            // endedAtMs - startedAtMs (kept for backward compat)
  outcome: 'success' | 'error';  // Phase 6 NEW (replaces presence-of-error inference)
  error?: string;                // present iff outcome === 'error'
  revisedPrompt?: string;        // pass-through from capability
  cost_usd?: number;             // Phase 9 will populate from capability.cost; Phase 6 may emit 0
  metadata?: Record<string, unknown>;
}

export interface Trace {
  runId: string;
  nodes: TraceNode[];
}

// Top-level response (image_op) — backward-compatible with Phase 5
export interface ImageOpResponse {
  success: boolean;
  output?: string;        // path of FINAL node's user-facing output
  runId: string;
  trace: Trace;
  error?: string;
}
```

**Rationale (vs. Phase 5 current shape):**
- Phase 5 currently emits `{ id, op, provider, model, output, latencyMs, revisedPrompt, metadata }` per node, **with `runId` only at the top level**.
- Phase 6 ADDS to each node: `artifactPath`, `outcome`, `startedAtMs`, `endedAtMs`. Keeps `latencyMs` for backward compatibility (or rename to `durationMs` — see "Decision needed").
- This is **additive** — existing consumers who read `runId`, `output`, and `trace.nodes[0].output` continue to work.
- Phase 9 SC#5 requires `cost_usd`, `latencyMs`, `revisedPrompt`, and saved artifact paths per node. All of these are present.

### Pattern 3: Mtime-Based Retention with In-Flight Protection
**What:** Sweep uses directory `mtime` to determine age. In-flight runs (currently being written) have recent mtime by definition (since each `writeNodeArtifact` updates it via the rename). The sweep runs only at startup (RUN-04), so by definition no `image_op` calls are in flight.

**Edge case:** If `IMAGE_GEN_RUN_RETENTION_HOURS=0`, sweep deletes ALL runs at startup. This is allowed but document it clearly.

### Anti-Patterns to Avoid
- **Don't use `runId` parsed-back for retention age**. Clock skew, future timestamps, and parse failure all become bugs. mtime is FS-truth.
- **Don't run periodic sweep**. RUN-04 specifies "at server startup". Periodic adds concurrency hazards (sweep deletes a node mid-write) for zero benefit on a personal MCP.
- **Don't put eval results inside `.runs/`**. Phase 7 writes `eval/results/<date>.json` — sibling to `.runs/`, not inside. Confirmed in roadmap.
- **Don't pass `outputPath` (user-facing destination) into run dir resolution**. The run dir base is the *outputDir*, not the user's chosen output file. Even when user specifies `outputPath: ~/photo.png`, the run dir lives in the configured outputDir.
- **Don't hardcode `.runs` literal in multiple files**. Export a single `RUN_DIR_NAME = '.runs'` constant.
- **Don't `await` retention sweep before stdio transport connects without a timeout cap**. A pathological `.runs/` directory could delay startup. Wrap with `try/catch` and log; never let sweep failure crash the server.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic file write | Custom fsync + rename | `fs.promises.writeFile` + `fs.promises.rename` (existing pattern in `saveImage`) | Already shipped, already proven; tmp+rename within same dir is POSIX-atomic |
| Recursive directory removal | Manual readdir + unlink loop | `fs.promises.rm(dir, { recursive: true, force: true })` | Node 14.14+ provides this; handles partial failures, missing dirs |
| Time math for retention | Manual hour/minute math | `Date.now() - mtime.getTime() < retentionMs` | Subtract epoch-ms; one comparison |
| ID generation | Custom incrementing counter | `crypto.randomBytes(6).toString('hex')` + ISO timestamp (Phase 5 pattern) | Already used; collision risk is 2^48 per millisecond — vanishingly small for a personal MCP |
| JSON manifest validation | Custom validator | Skip runtime validation entirely (server-written, server-read) OR use existing `zod` if defensive | Manifest is a debug artifact; over-engineering hurts |

**Key insight:** Phase 6 is mostly *plumbing existing patterns into a new directory layout*. The technical risk is in the **trace contract** (which Phase 9 inherits) and the **retention semantics** (which interact with concurrent runs and clock skew). The disk I/O parts are already solved by `saveImage`.

## Common Pitfalls

### Pitfall 1: Running sweep concurrently with in-flight runs
**What goes wrong:** Sweep walks `.runs/`, sees an old-mtime directory while another process/request is writing into it, deletes mid-write.
**Why it happens:** Periodic timer-based sweep, or sweep called from a request handler.
**How to avoid:** Sweep ONLY at startup, before MCP transport connects. RUN-04 already specifies this. Do not add periodic timers.
**Warning signs:** Truncated PNGs in trace responses; "no such file or directory" errors mid-request.

### Pitfall 2: Running sweep on the wrong base directory
**What goes wrong:** User passes `outputPath: ~/photo.png` for a single call; sweep deletes runs from `~` (the parent of that path).
**Why it happens:** Confusing per-call `outputPath` with the configured `outputDir`.
**How to avoid:** Sweep base is **always** the resolved `IMAGE_GEN_OUTPUT_DIR` (or default `~/Downloads/generated-images`). Per-call `outputPath` / `outputDir` parameters are for user-facing output files only and never affect run-dir location.

### Pitfall 3: Retention env var parsing accepts garbage
**What goes wrong:** `IMAGE_GEN_RUN_RETENTION_HOURS="abc"` → `parseFloat` returns `NaN` → `Date.now() - mtime < NaN` is always false → nothing ever deletes (silent retention growth).
**Why it happens:** Treating env var as opaque string.
**How to avoid:** `parseRetentionHours(raw): number` — explicit Number coercion, `Number.isFinite` check, reject negative, reject `NaN`. On invalid: log warning, fall back to 24 (default). This matches the `learned-rule`: throw on invalid explicit input, only fall back to defaults for **absent** input — but we want fail-soft startup, so log + default is acceptable as long as it's clearly logged.

### Pitfall 4: Cross-platform `.runs/` visibility on Windows
**What goes wrong:** Windows does NOT use leading-dot convention to hide directories — `.runs/` is fully visible in Explorer. [LOW confidence — couldn't find authoritative source for "Windows shows leading-dot dirs"]
**Why it happens:** Cross-platform assumption.
**How to avoid:** Document as visible-but-distinguished. The leading dot still works as a directory name on NTFS, just not as a hide signal. For a personal MCP that targets macOS primarily, this is acceptable. Don't try to set Windows hidden-attribute via API — that would require `node-ffi` or a child-process `attrib` call, which is out of scope.
**Warning signs:** Confused user reports "what is this .runs folder cluttering my Downloads".

### Pitfall 5: Trace shape change in Phase 9 breaks Phase 6 callers
**What goes wrong:** Phase 6 ships `{ trace: { nodes: [{ ..., latencyMs }] } }`. Phase 9 needs additional fields and a maintainer renames `latencyMs → durationMs`. Existing tooling/agents that parsed the Phase 6 response break.
**Why it happens:** Trace shape evolves without backward-compat thinking.
**How to avoid:** Pick the final field names NOW, in Phase 6. If renaming `latencyMs → durationMs`, do it in Phase 6, not Phase 9. Recommendation: keep `latencyMs` (Phase 5 already shipped it), and add `startedAtMs`/`endedAtMs` alongside as additive new fields.

### Pitfall 6: Partial run with no manifest is unfindable
**What goes wrong:** Capability throws after `n1.png` is written. The catch path returns an error trace but never writes `manifest.json`. The orphaned PNG sits in `.runs/<runId>/` until retention deletes it, with no record of what produced it.
**Why it happens:** Manifest write happens at end of handler; error path doesn't reach it.
**How to avoid:** Write `manifest.json` BEFORE invoking the capability (status="started"), then update or rewrite at end (status="success"|"error"). Atomic rewrite via tmp+rename is fine.
**Warning signs:** Mystery PNGs in `.runs/` with no manifest; can't trace which call produced them.

### Pitfall 7: Concurrent runs with same runId
**What goes wrong:** Two `image_op` calls happen in the same millisecond and (1 in 2^48) get the same hex suffix. Run dirs collide; one writes over the other.
**Why it happens:** Vanishingly unlikely; not really a pitfall in practice.
**How to avoid:** `mkdir(runDir, { recursive: false })` would fail-loud, but recursive: true is fine because the collision probability for a personal MCP is sub-cosmic-ray. Don't over-engineer.

### Pitfall 8: `outputPath` user-facing vs. runDir artifact path leak
**What goes wrong:** User asks for `outputPath: ~/foo.png`. Phase 6 writes the artifact to `<outputDir>/.runs/<runId>/n1.png` AND saves the user-facing copy to `~/foo.png`. Both files exist. The user is confused and thinks Phase 6 created a duplicate.
**Why it happens:** New behavior — Phase 5 only wrote one file.
**How to avoid:** Document explicitly. The `.runs/<runId>/n1.png` IS the run artifact (debugging, eval inputs, future re-execution). The user-facing copy is the deliverable. They are distinct on purpose. Trace's `artifactPath` is the run copy; trace's `output` is the user-facing copy.
**Warning signs:** "Why are there two of every image?" support reports.

### Pitfall 9: Non-atomic JSON manifest writes corrupt on crash mid-write
**What goes wrong:** Server crashes during `fs.promises.writeFile('manifest.json', JSON.stringify(...))` — manifest is half-written; readers fail with `JSON.parse` error.
**How to avoid:** Same atomic pattern (`<path>.tmp` + rename) for manifest as for PNG. Reuse `writeFileAtomic`.

### Pitfall 10: Logging library missing
**What goes wrong:** CLAUDE.md says "use `logger.error()` with context". This codebase uses `console.error()` (verified — see `src/index.ts:51, 549, etc.`). No `logger` exists.
**How to avoid:** Continue with `console.error` for sweep diagnostics. Don't introduce a logger framework in Phase 6 — that would be drive-by refactor (CLAUDE.md anti-pattern). Match existing style.

## Code Examples

### Run ID generation (carry-forward of Phase 5)
```typescript
// src/runs/id.ts (NEW)
// Source: pattern already shipped in src/index.ts:443
import * as crypto from 'crypto';

export function createRunId(now: Date = new Date()): string {
  const ts = now.toISOString().replace(/[:.]/g, '-'); // 2026-05-01T12-34-56-789Z
  const rand = crypto.randomBytes(3).toString('hex'); // 6 hex chars
  return `run-${ts}-${rand}`;
}
```

### Run directory resolution
```typescript
// src/runs/dir.ts (NEW)
import * as path from 'path';
import * as fs from 'fs/promises';
import { getOutputDir } from '../utils/image.js';

export const RUN_DIR_NAME = '.runs';

export async function resolveRunsRoot(): Promise<string> {
  const outputDir = await getOutputDir();
  const runsRoot = path.join(outputDir, RUN_DIR_NAME);
  await fs.mkdir(runsRoot, { recursive: true });
  return runsRoot;
}

export async function resolveRunDir(runId: string): Promise<string> {
  const root = await resolveRunsRoot();
  const runDir = path.join(root, runId);
  await fs.mkdir(runDir, { recursive: true });
  return runDir;
}

export function nodeArtifactPath(runDir: string, nodeId: string): string {
  return path.join(runDir, `n${nodeId}.png`);
}

export function manifestPath(runDir: string): string {
  return path.join(runDir, 'manifest.json');
}
```

### Atomic write helpers
```typescript
// src/runs/write.ts (NEW)
import * as fs from 'fs/promises';

export async function writeFileAtomic(
  filePath: string,
  data: Buffer | string,
): Promise<void> {
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, filePath);
}
```

### Manifest schema
```typescript
// src/runs/manifest.ts (NEW)
export interface RunManifest {
  schemaVersion: 1;
  runId: string;
  startedAt: string;        // ISO
  endedAt?: string;         // ISO, present when status != 'in_progress'
  status: 'in_progress' | 'success' | 'error';
  invocation: {
    tool: 'image_op' | 'image_task';
    op: string;             // CapabilityOp
    provider: string;
    params: Record<string, unknown>; // sanitized — see security note
    outputPath?: string;
    outputDir?: string;
  };
  nodes: Array<{
    id: string;
    op: string;
    provider: string;
    model?: string;
    artifactPath?: string;
    durationMs?: number;
    outcome?: 'success' | 'error';
    error?: string;
  }>;
  finalOutput?: string;     // user-facing saved path
  totalDurationMs?: number;
}
```

**Security note for manifest params:** `params.input` may be a user-readable file path. The manifest will store this. For a personal MCP this is acceptable (the path is user-known). Do NOT store raw image bytes or base64 in the manifest. For `edit_prompt`, `params.prompt` may contain user content — also acceptable for personal-MCP scope, but flag it: large prompts inflate manifest size. Consider truncating prompts > 1000 chars to first 500 + last 100 chars.

### Retention sweep
```typescript
// src/runs/retention.ts (NEW)
import * as fs from 'fs/promises';
import * as path from 'path';
import { resolveRunsRoot } from './dir.js';

const DEFAULT_RETENTION_HOURS = 24;

export function parseRetentionHours(raw: string | undefined): number {
  if (raw === undefined || raw === null) return DEFAULT_RETENTION_HOURS;
  const trimmed = String(raw).trim();
  if (trimmed === '') return DEFAULT_RETENTION_HOURS;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) {
    console.error(
      `Warning: IMAGE_GEN_RUN_RETENTION_HOURS='${raw}' is invalid (must be a non-negative number). Using default ${DEFAULT_RETENTION_HOURS}.`,
    );
    return DEFAULT_RETENTION_HOURS;
  }
  return n;
}

export interface SweepResult {
  scanned: number;
  deleted: number;
  errors: Array<{ runDir: string; error: string }>;
}

export async function sweepRunArtifacts(
  retentionHours: number,
  now: number = Date.now(),
): Promise<SweepResult> {
  const result: SweepResult = { scanned: 0, deleted: 0, errors: [] };
  const cutoff = now - retentionHours * 60 * 60 * 1000;

  let root: string;
  try {
    root = await resolveRunsRoot();
  } catch (err) {
    // Output dir not yet created or unreachable — nothing to sweep
    return result;
  }

  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (err) {
    return result;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith('run-')) continue;
    result.scanned += 1;
    const runDir = path.join(root, entry.name);
    try {
      const stat = await fs.stat(runDir);
      if (stat.mtimeMs >= cutoff) continue;
      await fs.rm(runDir, { recursive: true, force: true });
      result.deleted += 1;
    } catch (err) {
      result.errors.push({
        runDir,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return result;
}
```

### Wiring into `main()`
```typescript
// src/index.ts (MODIFY) — within main(), before transport.connect
import { sweepRunArtifacts, parseRetentionHours } from './runs/index.js';

const retentionHours = parseRetentionHours(process.env.IMAGE_GEN_RUN_RETENTION_HOURS);
try {
  const result = await sweepRunArtifacts(retentionHours);
  console.error(
    `Run retention: scanned=${result.scanned} deleted=${result.deleted} retention=${retentionHours}h${result.errors.length ? ` errors=${result.errors.length}` : ''}`,
  );
} catch (err) {
  console.error(
    `Run retention sweep failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
  );
}
```

### `image_op` handler refactor
```typescript
// src/index.ts (MODIFY) — image_op handler
async ({ op, provider, params, outputPath, outputDir }) => {
  const startedAt = Date.now();
  const runId = createRunId();
  const runDir = await resolveRunDir(runId);
  const nodeId = '1';
  const artifactPath = nodeArtifactPath(runDir, nodeId);

  // Write in-progress manifest first (so partial state is debuggable)
  await writeManifest(runDir, {
    schemaVersion: 1,
    runId,
    startedAt: new Date(startedAt).toISOString(),
    status: 'in_progress',
    invocation: { tool: 'image_op', op, provider, params, outputPath, outputDir },
    nodes: [],
  });

  const capability = capabilityRegistry.get(op as CapabilityOp, provider);
  if (!capability) {
    // ... existing missing-capability error path; finalize manifest with status='error'
  }

  try {
    validateCapabilityParams(capability, params);
    const nodeStartedAt = Date.now();
    const result = await capability.invoke({ params, outputPath, outputDir });
    const nodeEndedAt = Date.now();

    // 1. Write to run artifact path (atomic)
    await writeFileAtomic(artifactPath, result.buffer);

    // 2. Save user-facing copy via existing logic
    const finalOutput = await resolveOutputPath({
      outputPath, outputDir, prompt: `${op}-${provider}`, provider,
    });
    await saveImage(result.buffer, finalOutput);

    // 3. Finalize manifest
    const node: TraceNode = {
      id: `n${nodeId}`,
      op, provider, model: result.model,
      artifactPath, output: finalOutput,
      startedAtMs: nodeStartedAt, endedAtMs: nodeEndedAt,
      durationMs: nodeEndedAt - nodeStartedAt,
      latencyMs: nodeEndedAt - nodeStartedAt, // backward compat
      outcome: 'success',
      revisedPrompt: result.revisedPrompt,
      metadata: result.metadata,
    };
    await writeManifest(runDir, { /* full manifest with status='success' */ });

    return jsonResponse({
      success: true, output: finalOutput, runId,
      trace: { runId, nodes: [node] },
    });
  } catch (error) {
    // ... finalize manifest with status='error', emit error trace node
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single saved output, no audit trail (Phase 5) | Run dir per call with manifest + artifacts | Phase 6 (this) | Enables eval (Phase 7), debugging, future re-execution |
| `runId` only at top level of response (Phase 5) | `runId` at top level AND in trace + per-node `artifactPath` | Phase 6 (this) | Forward-compatible with Phase 9 multi-node |
| `latencyMs` per node (Phase 5) | `latencyMs` + `startedAtMs` + `endedAtMs` per node | Phase 6 (this) | Phase 9 needs start/end for parallelism debugging |
| Implicit "success if no error key" (Phase 5) | Explicit `outcome: 'success' \| 'error'` per node | Phase 6 (this) | Removes inference; Phase 9 partial-failure traces are clearer |

**Deprecated/outdated:** Nothing deprecated. All Phase 5 fields remain present.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Keeping the existing Phase 5 runId format is preferred over migrating to ULID/UUIDv7 | Standard Stack > Alternatives | LOW — if user prefers shorter IDs, swap is trivial; one file (`src/runs/id.ts`) |
| A2 | Per-startup sweep only (no periodic timer) is sufficient for personal-MCP scope | Architecture Patterns > Pattern 3 | LOW — RUN-04 explicitly says startup; periodic can be added later |
| A3 | Storing `params.input` (file path) and `params.prompt` (user text) in the manifest is acceptable for personal-MCP scope | Manifest schema > Security note | LOW — paths are user-known; prompts can be truncated. Confirm with Ben if multi-user concerns. |
| A4 | Renaming `latencyMs → durationMs` is NOT done; both fields emitted side-by-side | Pitfall 5 | MEDIUM — if Phase 9 maintainer renames, breaks consumers. Decide before Phase 6 ships. |
| A5 | `mtime` of run directory is updated on every node-artifact write, so in-progress runs naturally have recent mtime | Architecture Patterns > Pattern 3 | LOW — verified: `fs.rename` into a directory updates parent mtime on POSIX. Some Linux mount options (`noatime`, `relatime`) affect *atime*, not *mtime*. |
| A6 | The user's `outputDir` (per-call param) does NOT change the run dir base; only `IMAGE_GEN_OUTPUT_DIR` (or default) does | Architecture > Pitfall 2 | MEDIUM — could go either way; I recommend env-only base for sweep predictability. Confirm during plan-check. |
| A7 | Default retention is 24 hours when env var is absent OR invalid | Code Examples > parseRetentionHours | LOW — RUN-03 specifies "default 24"; behavior on invalid is implementation choice. |
| A8 | Phase 6 does NOT add runIds to v1.0 tools (`generate_image`, `process_image`, `generate_asset`) | User Constraints | LOW — STATE.md decision: "v1.0 tools remain unchanged". |
| A9 | Phase 7 (eval) writes results to `eval/results/<date>.json` SIBLING to `.runs/`, not nested | Anti-Patterns | VERIFIED — roadmap line "writes `eval/results/<date>.json`" |
| A10 | The runs module has no tests in current codebase to extend (no test framework installed) | Validation Architecture | VERIFIED — `package.json` has no test runner; no `tests/` dir |

## Open Questions

1. **`latencyMs` vs `durationMs` field name in trace**
   - What we know: Phase 5 ships `latencyMs`. Phase 9 SC#5 says "per-node `latency_ms`" (snake_case).
   - What's unclear: Whether to keep `latencyMs`, rename to `durationMs`, or emit both. Roadmap is camelCase elsewhere.
   - Recommendation: **Keep `latencyMs`** (don't rename — Phase 5 shipped it). Add `startedAtMs`/`endedAtMs` as new additive fields. Future Phase 9 can add `cost_usd` (snake or camel — pick during Phase 9).

2. **Should the run dir be created lazily or always?**
   - What we know: Every `image_op` call needs a run dir for the artifact write.
   - What's unclear: For *capability validation failures* (no provider, constraint violation), should we still create a run dir?
   - Recommendation: **Yes, always create runDir + write a status='error' manifest**. Symmetry: every runId in any response can be located on disk for debugging.

3. **Should manifest include `params.prompt` truncation threshold?**
   - What we know: Capability prompts can be up to 4000 chars (`maxPromptLength`).
   - What's unclear: Do we want full prompt in manifest (eval reproducibility) or truncated (size)?
   - Recommendation: **Full prompt** — eval needs reproducibility. 4KB max per manifest is fine. If concerns emerge, truncate later.

4. **What if `IMAGE_GEN_OUTPUT_DIR` changes between server restarts?**
   - What we know: Sweep runs against the *current* configured outputDir.
   - What's unclear: Old runs in a previous outputDir become orphaned.
   - Recommendation: **Document as expected behavior**. Sweep operates on the current configured outputDir only. Users who change `IMAGE_GEN_OUTPUT_DIR` are expected to clean up old `.runs/` manually if needed.

5. **Manifest schema versioning**
   - What we know: `schemaVersion: 1` is in the recommended manifest.
   - What's unclear: Does anyone read these manifests programmatically yet?
   - Recommendation: **Include `schemaVersion: 1`** so Phase 7 (eval reads) and Phase 9 (multi-node manifests) can detect and migrate.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js with `fs/promises.rm` (recursive) | retention sweep | ✓ | v22.14.0 | — (Node ≥ 14.14 required) |
| Node.js with `crypto.randomBytes` | runId | ✓ | v22.14.0 | — |
| `@modelcontextprotocol/sdk` | already installed | ✓ | ^1.0.0 | — |
| Filesystem with sub-second mtime resolution | retention sweep accuracy | ✓ (APFS, ext4, NTFS) | n/a | mtime within 1s tolerance is acceptable |
| Existing `getOutputDir`, `saveImage`, `resolveOutputPath` | reused | ✓ | n/a | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | **None currently installed** |
| Config file | none — see Wave 0 |
| Quick run command | n/a until installed |
| Full suite command | n/a until installed |

The repository ships with `npm run build` (tsc) only. No `vitest`, `jest`, or `mocha` is present in `package.json`. Phase 6 introduces non-trivial filesystem semantics (atomic writes, retention sweep with manipulated mtimes, trace shape stability) that strongly benefit from automated tests.

**Recommendation:** Install `vitest` (fast, ESM-native, ships TS support, idiomatic with `tsx`/`tsc` workflow). Add as devDependency in Phase 6 Wave 0. Alternative: `node:test` (built-in, zero deps, good enough). Choose based on Ben's preference.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RUN-01 | `createRunId()` produces unique IDs across rapid calls (1000 in a tight loop, all unique) | unit | `vitest run tests/runs/id.test.ts` | ❌ Wave 0 |
| RUN-01 | `createRunId()` format matches `/^run-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[0-9a-f]{6}$/` | unit | same | ❌ Wave 0 |
| RUN-02 | `writeFileAtomic` produces only the final file (no `.tmp` orphan) on success | unit | `vitest run tests/runs/write.test.ts` | ❌ Wave 0 |
| RUN-02 | `writeFileAtomic` leaves no partial file on simulated mid-write failure | unit | same | ❌ Wave 0 |
| RUN-02 | `image_op` invocation produces `<outputDir>/.runs/<runId>/n1.png` AND user-facing output | integration | `vitest run tests/integration/image_op.runs.test.ts` (uses tmp dir, mocked capability) | ❌ Wave 0 |
| RUN-03 | `parseRetentionHours("1") === 1`, `parseRetentionHours(undefined) === 24`, `parseRetentionHours("abc") === 24` | unit | `vitest run tests/runs/retention.test.ts` | ❌ Wave 0 |
| RUN-04 | `sweepRunArtifacts(1)` deletes a directory whose mtime is >1h old (set via `fs.utimes`) | unit | same | ❌ Wave 0 |
| RUN-04 | `sweepRunArtifacts(1)` keeps a directory whose mtime is <1h old | unit | same | ❌ Wave 0 |
| RUN-04 | Sweep does not throw if `.runs/` does not exist | unit | same | ❌ Wave 0 |
| RUN-04 | Sweep skips non-`run-*` entries (defense in depth) | unit | same | ❌ Wave 0 |
| RUN-05 | `image_op` response shape includes top-level `runId` AND `trace.nodes[0].artifactPath` | integration | `vitest run tests/integration/image_op.trace.test.ts` (snapshot) | ❌ Wave 0 |
| (contract) | Trace shape snapshot matches expected schema | snapshot | `vitest run tests/integration/image_op.trace.test.ts` | ❌ Wave 0 |
| (e2e) | Set `IMAGE_GEN_RUN_RETENTION_HOURS=1`, manually age a run dir via `fs.utimes`, restart server, verify deletion | manual UAT | n/a (HUMAN-UAT.md) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run build && npx vitest run tests/runs/`
- **Per wave merge:** `npm run build && npx vitest run` (full suite)
- **Phase gate:** All tests green + manual UAT verifies retention with restart before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Install test framework: `npm install -D vitest @types/node` (or use `node:test` if Ben prefers zero-dep)
- [ ] Add `"test": "vitest run"` and `"test:watch": "vitest"` to `package.json` scripts
- [ ] Create `vitest.config.ts` (minimal — `test: { environment: 'node' }`)
- [ ] Create `tests/runs/id.test.ts` — covers RUN-01
- [ ] Create `tests/runs/write.test.ts` — covers RUN-02 atomicity
- [ ] Create `tests/runs/retention.test.ts` — covers RUN-03, RUN-04
- [ ] Create `tests/integration/image_op.runs.test.ts` — covers RUN-02 end-to-end with mocked capability
- [ ] Create `tests/integration/image_op.trace.test.ts` — covers RUN-05 + snapshot trace contract
- [ ] Create `tests/helpers/tmpOutputDir.ts` — sets up isolated tmp `IMAGE_GEN_OUTPUT_DIR` per test, tears down after

**Mtime manipulation pattern** for retention tests:
```typescript
// In retention test
import * as fs from 'fs/promises';
const old = (Date.now() - 2 * 60 * 60 * 1000) / 1000; // 2h ago
await fs.utimes(runDir, old, old);
```

**Note on testing without a framework:** If Ben prefers not to add vitest, `node:test` (built-in since Node 18) is acceptable: `node --test tests/runs/*.test.js` (after compile) or `tsx --test tests/runs/*.test.ts`. Either works; vitest has friendlier ergonomics and snapshots out of the box.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | MCP transport (stdio) is local; no auth needed |
| V3 Session Management | no | Per-call runId is not a session token |
| V4 Access Control | partial | Run dir is under user-controlled outputDir; no cross-user concerns (single-user MCP) |
| V5 Input Validation | yes | `IMAGE_GEN_RUN_RETENTION_HOURS` parsing; runId format never echoed back from user input |
| V6 Cryptography | no | `crypto.randomBytes` is used for ID entropy only, not security |
| V7 Error Handling | yes | Sweep errors must not crash startup; capability errors must finalize manifest |
| V8 Data Protection | partial | Manifest stores user prompt + file paths in plaintext on disk — acceptable for personal-MCP |
| V12 File Handling | yes | Path traversal in runId, manifest paths, atomic write tmp paths |
| V13 API & Web Service | no | Local stdio transport |
| V14 Configuration | yes | Env var parsing fail-soft with logged warning |

### Known Threat Patterns for Node.js filesystem layer

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via runId injection (e.g., user-influenced runId containing `..`) | Tampering | runId is server-generated only, never accepted as user input. Format regex enforces `^run-...$`. |
| Path traversal via `outputDir` containing `..` | Tampering | Existing `path.resolve` + `path.join` produces absolute paths; user already controls outputDir by design. |
| Symlink attack on `.runs/<runId>/` (attacker pre-creates symlink, atomic write follows it) | Tampering | Single-user personal MCP — no untrusted local processes assumed. Document threat-model boundary. If concerned: `fs.lstat` check before write (not implementing — over-engineering for scope). |
| Manifest discloses sensitive paths/prompts | Information Disclosure | Acceptable — manifest is user-readable file in user's own directory. No transmission. |
| Sweep deletes user data outside `.runs/` | Tampering | Sweep ONLY operates on entries inside resolved `.runs/` whose name matches `run-*`. Defense in depth: check `entry.isDirectory()` AND name prefix BEFORE `rm -rf`. Never `rm` the runs root itself. |
| Race: sweep deletes a dir during another concurrent process's write | Tampering | Sweep runs before MCP transport connects; no in-flight `image_op` possible. Document this invariant in code comments. |
| TOCTOU on stat/rm in sweep | Tampering | Acceptable; sweep is idempotent and `fs.rm({ force: true })` ignores already-deleted dirs. |
| Disk fill via runaway runs without retention | DoS | Retention is the mitigation. If user sets retention=∞ that's their choice. Default 24h bounds growth. |
| Manifest tmp file leaks PID or hostname | Information Disclosure | Tmp pattern is `<final>.tmp` (no PID). No leak. |
| Capability error path leaks API keys via `error.message` | Information Disclosure | Existing risk from Phase 5; not changed by Phase 6. (Manifest stores error message — same risk surface as trace.) |

**Phase 6 net security delta vs Phase 5:** New on-disk artifacts (PNGs and JSON manifests) stored under user-controlled `outputDir`. Sweep is the only new destructive operation. Risk profile: low for a personal MCP.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `src/index.ts`, `src/utils/image.ts`, `src/capabilities/*` (read directly, lines cited)
- `.planning/REQUIREMENTS.md` (RUN-01..05, OP-01..04, TASK-01..10)
- `.planning/ROADMAP.md` (Phase 6, 7, 8, 9 success criteria)
- `.planning/STATE.md` (locked decisions)
- `.planning/phases/05-*/05-0{1,2,3}-PLAN.md` and `*-SUMMARY.md` (Phase 5 contract)
- [Node.js fs API documentation](https://nodejs.org/api/fs.html) — `fs.rename`, `fs.utimes`, `fs.rm`, `fs.readdir` semantics
- Local environment: `node --version` → v22.14.0

### Secondary (MEDIUM confidence)
- [`fs.rename` is atomic on Unix-like systems within same filesystem; Windows behavior may differ](https://nodejs.org/api/fs.html) — Node docs + cross-referenced
- [`write-file-atomic` (npm)](https://github.com/npm/write-file-atomic) — confirms tmp + rename pattern is industry standard
- [ULID spec](https://github.com/ulid/spec) and [Time-sortable identifiers comparison (Authgear)](https://www.authgear.com/post/time-sortable-identifiers-uuidv7-ulid-snowflake) — informed runId discussion (decision: keep current format)

### Tertiary (LOW confidence)
- Windows behavior for leading-dot directories — couldn't find authoritative Microsoft source. Documented as caveat in Pitfall 4.
- Cross-platform `fs.rename` atomicity claim for Windows — Node docs suggest "may not be atomic on Windows" but specifics depend on filesystem (NTFS vs FAT). For personal-MCP scope on macOS this is HIGH confidence; on Windows it's LOW. Documented as acceptable risk.

## Metadata

**Confidence breakdown:**
- runId format: HIGH — Phase 5 already shipped this; behavior verified in `src/index.ts:443`
- Atomic writes: HIGH — pattern already in `saveImage`, just generalizing
- Retention sweep: HIGH — `fs.rm({ recursive, force })` is well-documented; mtime-based age is standard
- Trace contract evolution: MEDIUM — Phase 9 details (cost_usd field name) not locked; recommendation is to additively extend, not rename
- Cross-platform path safety: MEDIUM — primary target is macOS; Windows is best-effort
- Test infrastructure: HIGH — confirmed no framework currently installed; vitest recommendation is standard

**Research date:** 2026-05-01
**Valid until:** ~2026-06-01 (30 days for stable filesystem APIs and personal-MCP scope)

## RESEARCH COMPLETE

Phase 6 is plumbing existing patterns (`saveImage` atomic write, Phase 5 runId, `crypto.randomBytes`) into a new `src/runs/` module with retention sweep at startup. Zero new runtime dependencies. Critical decisions: (a) **keep Phase 5 runId format**, (b) **trace shape additively extends Phase 5** with `artifactPath`/`outcome`/`startedAtMs`/`endedAtMs` per node so Phase 9 multi-node DAG inherits without reshape, (c) **sweep at startup only**, (d) install test framework (vitest recommended) in Wave 0 to validate atomicity, retention math, and trace snapshot.
