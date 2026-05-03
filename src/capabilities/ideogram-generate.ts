import type { Capability } from './types.js';
import { CapabilityInvokeError } from './types.js';

const MODEL_VERSION = 'ideogram-v3-0';
const ENDPOINT = 'https://api.ideogram.ai/v1/ideogram-v3/generate';
const MAX_PROMPT_LENGTH = 4000;
const FETCH_TIMEOUT_MS = 30_000;
const FETCH_RETRIES = 1;
const ASPECT_MAP = {
  square: 'ASPECT_1_1',
  landscape: 'ASPECT_16_9',
  portrait: 'ASPECT_9_16',
} as const;

interface IdeogramGenerateResponse {
  data?: Array<{
    url?: string;
    seed?: number;
  }>;
  error?: { message?: string };
}

function resolveOptionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || /^\$\{[^}]+\}$/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

async function fetchWithTimeoutRetry(
  url: string,
  timeoutMs: number,
  retries: number,
): Promise<Buffer> {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      clearTimeout(timer);
      return Buffer.from(arrayBuffer);
    } catch (error) {
      clearTimeout(timer);
      if (attempt === retries) {
        throw new CapabilityInvokeError(
          'TIMEOUT',
          `Ideogram URL fetch failed after ${retries + 1} attempts: ${error instanceof Error ? error.message : String(error)}`,
          true,
        );
      }
    }
  }

  throw new CapabilityInvokeError('PROVIDER_FAILURE', 'unreachable', true);
}

async function parseJsonResponse(response: Response): Promise<IdeogramGenerateResponse> {
  const rawBody = await response.text();
  if (!rawBody.trim()) {
    return {};
  }
  try {
    return JSON.parse(rawBody) as IdeogramGenerateResponse;
  } catch {
    return {
      error: {
        message: `Ideogram generate returned non-JSON response: ${rawBody.slice(0, 500)}`,
      },
    };
  }
}

function aspectFor(size: unknown): string {
  if (size === undefined) {
    return ASPECT_MAP.square;
  }
  if (typeof size !== 'string' || !(size in ASPECT_MAP)) {
    throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', `generate does not support size '${size}'`, false);
  }
  return ASPECT_MAP[size as keyof typeof ASPECT_MAP];
}

export function createIdeogramGenerateCapability(): Capability | null {
  const apiKey = resolveOptionalEnv(process.env.IDEOGRAM_API_KEY);
  if (!apiKey) {
    return null;
  }

  return {
    op: 'generate',
    provider: 'ideogram',
    modelVersion: MODEL_VERSION,
    constraints: {
      requiresInputImage: false,
      supportsMultipleInputs: false,
      maxPromptLength: MAX_PROMPT_LENGTH,
      supportedSizes: ['square', 'landscape', 'portrait'],
      outputFormat: 'png',
    },
    cost: { perCallUsd: 0.08 },
    latencyMsP50: 8000,
    async invoke(input) {
      const prompt = input.params.prompt;
      if (typeof prompt !== 'string' || !prompt.trim()) {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'generate requires params.prompt', false);
      }
      if (prompt.length > MAX_PROMPT_LENGTH) {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'generate prompt exceeds max length 4000', false);
      }

      const form = new FormData();
      form.set('prompt', prompt);
      form.set('aspect_ratio', aspectFor(input.params.size));
      form.set('rendering_speed', 'DEFAULT');
      form.set('num_images', '1');

      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Api-Key': apiKey },
        body: form,
      });
      const responseBody = await parseJsonResponse(response);
      if (!response.ok) {
        throw new CapabilityInvokeError(
          'PROVIDER_FAILURE',
          responseBody.error?.message || `Ideogram generate failed with status ${response.status}`,
          true,
        );
      }

      const image = responseBody.data?.[0];
      if (!image?.url) {
        throw new CapabilityInvokeError('PROVIDER_FAILURE', 'Ideogram returned no image URL', true);
      }
      const buffer = await fetchWithTimeoutRetry(image.url, FETCH_TIMEOUT_MS, FETCH_RETRIES);

      return {
        kind: 'image',
        buffer,
        model: MODEL_VERSION,
        metadata: {
          prompt,
          seed: image.seed,
          provider: 'ideogram',
          modelVersion: 'ideogram-v3-0',
          qualityMeasured: false,
        },
      };
    },
  };
}
