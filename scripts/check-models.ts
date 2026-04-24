/**
 * check-models.ts — Read-only image-model inventory across configured providers.
 *
 * Runs via `npm run check-models` (invoked through tsx). Queries each provider's
 * models listing endpoint, filters for image-capable models, and prints a report
 * comparing discovered models against the current hard-coded defaults in
 * src/providers/*.ts.
 *
 * IMPORTANT: This script is intentionally standalone. It does NOT import from
 * src/ so it runs without pulling the MCP SDK or building the server. The
 * KNOWN_DEFAULTS map below is a MANUALLY-KEPT mirror of the `defaultModel`
 * values in src/providers/*.ts — when you bump a default in a provider, update
 * the matching entry here in the same commit.
 *
 * Network calls use native fetch (Node 18+). No runtime dependencies.
 */

// ---------------------------------------------------------------------------
// KNOWN_DEFAULTS — manually mirror src/providers/*.ts defaultModel values.
// Last synced: 2026-04-24
// ---------------------------------------------------------------------------

const KNOWN_DEFAULTS: Record<ProviderName, string> = {
  openai: 'gpt-image-2',
  gemini: 'gemini-2.5-flash-image',
  grok: 'grok-2-image',
  together: 'black-forest-labs/FLUX.1-schnell',
  replicate: 'black-forest-labs/flux-1.1-pro',
};

type ProviderName = 'openai' | 'gemini' | 'grok' | 'together' | 'replicate';

interface ProviderReport {
  provider: ProviderName;
  skipped?: string;
  models: Array<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Image-relevance heuristic
// ---------------------------------------------------------------------------

const IMAGE_KEYWORDS = [
  'image',
  'imagen',
  'dall-e',
  'dalle',
  'flux',
  'stable-diffusion',
  'sd-',
  'aurora',
  'imagine',
];

function isImageModel(id: string): boolean {
  const lower = id.toLowerCase();
  return IMAGE_KEYWORDS.some((kw) => lower.includes(kw));
}

// ---------------------------------------------------------------------------
// Response shape types (only fields we actually read)
// ---------------------------------------------------------------------------

interface OpenAIModelsResponse {
  data?: Array<{ id: string }>;
}

interface GeminiModelEntry {
  name?: string;
  supportedGenerationMethods?: string[];
}

interface GeminiModelsResponse {
  models?: GeminiModelEntry[];
}

interface XAIModelEntry {
  id?: string;
  name?: string;
}

interface XAIModelsResponse {
  models?: XAIModelEntry[];
  data?: XAIModelEntry[];
}

interface TogetherModelEntry {
  id?: string;
  type?: string;
}

// ---------------------------------------------------------------------------
// Per-provider fetchers
// ---------------------------------------------------------------------------

async function fetchOpenAI(): Promise<ProviderReport> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return { provider: 'openai', skipped: 'no key', models: [] };
  }
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      const body = await res.text();
      return {
        provider: 'openai',
        skipped: `error: HTTP ${res.status} ${body.slice(0, 200)}`,
        models: [],
      };
    }
    const json = (await res.json()) as OpenAIModelsResponse;
    const all = json.data ?? [];
    const models = all
      .map((m) => ({ id: m.id }))
      .filter((m) => isImageModel(m.id));
    return { provider: 'openai', models };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { provider: 'openai', skipped: `error: ${msg}`, models: [] };
  }
}

async function fetchGemini(): Promise<ProviderReport> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    return { provider: 'gemini', skipped: 'no key', models: [] };
  }
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      return {
        provider: 'gemini',
        skipped: `error: HTTP ${res.status} ${body.slice(0, 200)}`,
        models: [],
      };
    }
    const json = (await res.json()) as GeminiModelsResponse;
    const all = json.models ?? [];
    const models = all
      .map((m) => {
        const rawName = m.name ?? '';
        // Strip leading "models/" prefix when present.
        const id = rawName.startsWith('models/') ? rawName.slice('models/'.length) : rawName;
        return { id };
      })
      .filter((m) => m.id.length > 0 && isImageModel(m.id));
    return { provider: 'gemini', models };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { provider: 'gemini', skipped: `error: ${msg}`, models: [] };
  }
}

async function fetchGrok(): Promise<ProviderReport> {
  const key = process.env.XAI_API_KEY?.trim();
  if (!key) {
    return { provider: 'grok', skipped: 'no key', models: [] };
  }
  try {
    const headers = { Authorization: `Bearer ${key}` };
    const [langRes, imgRes] = await Promise.all([
      fetch('https://api.x.ai/v1/language-models', { headers }),
      fetch('https://api.x.ai/v1/image-generation-models', { headers }),
    ]);

    const collected: Array<{ id: string; forceInclude: boolean }> = [];

    if (imgRes.ok) {
      const imgJson = (await imgRes.json()) as XAIModelsResponse;
      const imgModels = imgJson.models ?? imgJson.data ?? [];
      for (const m of imgModels) {
        const id = m.id ?? m.name ?? '';
        if (id) collected.push({ id, forceInclude: true });
      }
    } else {
      const body = await imgRes.text();
      // Record but do not abort — language-models may still work.
      collected.push({
        id: `__err_image_endpoint__: HTTP ${imgRes.status} ${body.slice(0, 120)}`,
        forceInclude: false,
      });
    }

    if (langRes.ok) {
      const langJson = (await langRes.json()) as XAIModelsResponse;
      const langModels = langJson.models ?? langJson.data ?? [];
      for (const m of langModels) {
        const id = m.id ?? m.name ?? '';
        if (id) collected.push({ id, forceInclude: false });
      }
    }

    // Filter: force-included (image endpoint) always in; language models only if heuristic matches.
    const seen = new Set<string>();
    const models: Array<{ id: string }> = [];
    for (const entry of collected) {
      if (entry.id.startsWith('__err_image_endpoint__')) {
        // Surface via a skipped-partial hint? For now, ignore silently per contract —
        // but we already captured it by falling through to language-models.
        continue;
      }
      if (!entry.forceInclude && !isImageModel(entry.id)) continue;
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      models.push({ id: entry.id });
    }

    // If both endpoints hard-failed, surface an error.
    if (!imgRes.ok && !langRes.ok) {
      const langBody = await langRes.text().catch(() => '');
      return {
        provider: 'grok',
        skipped: `error: image-models HTTP ${imgRes.status}, language-models HTTP ${langRes.status} ${langBody.slice(0, 120)}`,
        models: [],
      };
    }

    return { provider: 'grok', models };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { provider: 'grok', skipped: `error: ${msg}`, models: [] };
  }
}

async function fetchTogether(): Promise<ProviderReport> {
  const key = process.env.TOGETHER_API_KEY?.trim();
  if (!key) {
    return { provider: 'together', skipped: 'no key', models: [] };
  }
  try {
    const res = await fetch('https://api.together.xyz/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      const body = await res.text();
      return {
        provider: 'together',
        skipped: `error: HTTP ${res.status} ${body.slice(0, 200)}`,
        models: [],
      };
    }
    const json = (await res.json()) as unknown;
    // Together returns a bare array. Defensive: also accept { data: [...] }.
    let entries: TogetherModelEntry[] = [];
    if (Array.isArray(json)) {
      entries = json as TogetherModelEntry[];
    } else if (json && typeof json === 'object' && Array.isArray((json as { data?: unknown }).data)) {
      entries = (json as { data: TogetherModelEntry[] }).data;
    }
    const models = entries
      .filter((m) => {
        const id = m.id ?? '';
        if (!id) return false;
        // Prefer explicit type === 'image' when present; else fall back to heuristic.
        if (typeof m.type === 'string') {
          if (m.type.toLowerCase() === 'image') return true;
          // If type is present but something else (chat, embedding, etc.), trust it.
          return false;
        }
        return isImageModel(id);
      })
      .map((m) => ({ id: m.id! }));
    return { provider: 'together', models };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { provider: 'together', skipped: `error: ${msg}`, models: [] };
  }
}

async function fetchReplicate(): Promise<ProviderReport> {
  // Replicate has no simple listing endpoint. Always skipped with a clear note.
  return {
    provider: 'replicate',
    skipped: 'no listing endpoint  (browse https://replicate.com/collections/text-to-image manually)',
    models: [],
  };
}

// ---------------------------------------------------------------------------
// NEW-model heuristic
// ---------------------------------------------------------------------------

/**
 * Conservative NEW detector: tag a model as NEW when it looks image-capable AND
 * its first version-number digit (after the provider/family prefix) is strictly
 * greater than the default's. Fall back to false when unsure — a false NEW is
 * worse than a false known. The user still eyeballs the report.
 */
function firstGenerationNumber(id: string): number | null {
  // Strip org prefix so we compare model-family versions, not org slugs.
  const tail = id.includes('/') ? id.split('/').slice(1).join('/') : id;
  // Match the first integer in the id (e.g. "gpt-image-2" -> 2, "gemini-3-pro-image" -> 3).
  const m = tail.match(/(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function isNewer(id: string, defaultId: string): boolean {
  const idGen = firstGenerationNumber(id);
  const defGen = firstGenerationNumber(defaultId);
  if (idGen == null || defGen == null) return false;
  return idGen > defGen;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function renderReport(reports: ProviderReport[]): { text: string; newCount: number; providersWithNew: number } {
  const lines: string[] = [];
  const today = new Date().toISOString().slice(0, 10);

  lines.push(`Image model inventory  —  ${today}`);
  lines.push('================================================================');
  lines.push('');

  let newCount = 0;
  let providersWithNew = 0;

  for (const r of reports) {
    const defaultModel = KNOWN_DEFAULTS[r.provider];
    const header = `## ${r.provider}`;
    lines.push(`${pad(header, 48)}default: ${defaultModel}`);

    if (r.skipped) {
      lines.push(`  skipped: ${r.skipped}`);
      lines.push('');
      continue;
    }

    if (r.models.length === 0) {
      lines.push('  (no image-capable models returned)');
      lines.push('');
      continue;
    }

    // Sort: default first, then NEW, then known alphabetically.
    const decorated = r.models.map((m) => {
      const isDefault = m.id === defaultModel;
      const isNew = !isDefault && isNewer(m.id, defaultModel);
      return { id: m.id, isDefault, isNew };
    });
    decorated.sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
      return a.id.localeCompare(b.id);
    });

    let providerHadNew = false;
    for (const d of decorated) {
      let label: string;
      if (d.isDefault) label = '[default]';
      else if (d.isNew) {
        label = '[  NEW  ]';
        newCount++;
        providerHadNew = true;
      } else label = '[ known ]';
      lines.push(`  ${label} ${d.id}`);
    }
    if (providerHadNew) providersWithNew++;
    lines.push('');
  }

  lines.push('----------------------------------------------------------------');
  if (newCount === 0) {
    lines.push('Summary: no new models detected.');
  } else {
    lines.push(
      `Summary: ${newCount} new model${newCount === 1 ? '' : 's'} detected across ${providersWithNew} provider${providersWithNew === 1 ? '' : 's'}.`
    );
  }

  return { text: lines.join('\n'), newCount, providersWithNew };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const reports = await Promise.all([
    fetchOpenAI(),
    fetchGemini(),
    fetchGrok(),
    fetchTogether(),
    fetchReplicate(),
  ]);

  const { text } = renderReport(reports);
  console.log(text);

  // Exit code: 1 only if every non-replicate provider is skipped (replicate is
  // always skipped by design, so don't count it against the success threshold).
  const actionable = reports.filter((r) => r.provider !== 'replicate');
  const allSkipped = actionable.every((r) => Boolean(r.skipped));
  if (allSkipped) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.stack ?? err.message : String(err);
  console.log(`check-models: fatal error\n${msg}`);
  process.exitCode = 1;
});
