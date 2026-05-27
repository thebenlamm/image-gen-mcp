import * as fs from 'fs';
import sharp from 'sharp';
import { assertWithinInputRoot } from '../utils/path-input-root.js';
import type { Capability } from './types.js';
import { CapabilityInvokeError } from './types.js';

const MAX_PROMPT_LENGTH = 4000;
const DEFAULT_TIMEOUT_MS = 90_000;
const TIMEOUT_MIN_MS = 1_000;
const TIMEOUT_MAX_MS = 300_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_INITIAL_DELAY_MS = 1_000;
const SIZE_MAP = {
  square: '1024x1024',
  landscape: '1536x1024',
  portrait: '1024x1536',
} as const;

interface OpenAIImageEditResponse {
  data?: Array<{
    b64_json?: string;
    revised_prompt?: string;
  }>;
}

async function parseJsonResponse(response: Response): Promise<OpenAIImageEditResponse & {
  error?: { message?: string };
}> {
  const rawBody = await response.text();
  if (!rawBody.trim()) {
    return {};
  }

  try {
    return JSON.parse(rawBody) as OpenAIImageEditResponse & { error?: { message?: string } };
  } catch {
    return {
      error: {
        message: `OpenAI edit returned non-JSON response: ${rawBody.slice(0, 500)}`,
      },
    };
  }
}

function resolveOptionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || /^\$\{[^}]+\}$/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

async function imageMimeType(buffer: Buffer): Promise<string> {
  const format = (await sharp(buffer).metadata()).format;
  if (format === 'png') return 'image/png';
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'webp') return 'image/webp';
  throw new CapabilityInvokeError('UNSUPPORTED', `edit_prompt unsupported input format '${format ?? 'unknown'}'`, false);
}

/**
 * Build a diagnostic message that surfaces the underlying fetch error class,
 * its `.code` (e.g. UND_ERR_SOCKET, ECONNRESET), and the same fields from
 * `.cause` if present. Lossy `fetch failed` strings were the #1 blocker for
 * batch debugging before this.
 */
function describeFetchError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts: string[] = [err.message || 'unknown error'];
  const code = (err as { code?: string }).code;
  if (code) parts.push(`code=${code}`);
  parts.push(`class=${err.name || 'Error'}`);
  const cause = (err as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const causeCode = (cause as { code?: string }).code;
    parts.push(`cause=${cause.name}${causeCode ? `/${causeCode}` : ''}: ${cause.message}`);
  } else if (cause !== undefined && cause !== null) {
    parts.push(`cause=${String(cause)}`);
  }
  return parts.join(' ');
}

function wrapFetchError(err: unknown): CapabilityInvokeError {
  const message = `OpenAI edit network error: ${describeFetchError(err)}`;
  return new CapabilityInvokeError('PROVIDER_FAILURE', message, true, undefined, { cause: err });
}

function isPositiveFiniteInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function resolveTimeoutMs(params: Record<string, unknown>): number {
  const raw = params.timeout_ms;
  if (raw === undefined) return DEFAULT_TIMEOUT_MS;
  if (!isPositiveFiniteInt(raw)) {
    throw new CapabilityInvokeError(
      'CONSTRAINT_VIOLATION',
      `edit_prompt timeout_ms must be a positive number (got ${typeof raw === 'number' ? raw : typeof raw})`,
      false,
    );
  }
  if (raw < TIMEOUT_MIN_MS || raw > TIMEOUT_MAX_MS) {
    throw new CapabilityInvokeError(
      'CONSTRAINT_VIOLATION',
      `edit_prompt timeout_ms must be between ${TIMEOUT_MIN_MS} and ${TIMEOUT_MAX_MS} (got ${raw})`,
      false,
    );
  }
  return raw;
}

function resolveMaxRetries(params: Record<string, unknown>): number {
  const raw = params.max_retries;
  if (raw === undefined) return DEFAULT_MAX_RETRIES;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > 5) {
    throw new CapabilityInvokeError(
      'CONSTRAINT_VIOLATION',
      `edit_prompt max_retries must be an integer in [0, 5] (got ${String(raw)})`,
      false,
    );
  }
  return raw;
}

function resolveRetryInitialDelayMs(params: Record<string, unknown>): number {
  const raw = params.retry_initial_delay_ms;
  if (raw === undefined) return DEFAULT_RETRY_INITIAL_DELAY_MS;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
    throw new CapabilityInvokeError(
      'CONSTRAINT_VIOLATION',
      `edit_prompt retry_initial_delay_ms must be a non-negative number (got ${String(raw)})`,
      false,
    );
  }
  return raw;
}

function backoffDelayMs(attempt: number, initialDelayMs: number): number {
  const base = initialDelayMs * Math.pow(2, attempt);
  const jitter = base * 0.25 * (Math.random() * 2 - 1);
  return Math.max(0, base + jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createEditPromptCapability(): Capability | null {
  const apiKey = resolveOptionalEnv(process.env.OPENAI_API_KEY);

  if (!apiKey) {
    return null;
  }

  const model = resolveOptionalEnv(process.env.OPENAI_EDIT_MODEL) || 'gpt-image-1.5';

  return {
    op: 'edit_prompt',
    provider: 'openai',
    modelVersion: model,
    constraints: {
      requiresInputImage: true,
      supportsMultipleInputs: false,
      maxPromptLength: 4000,
      supportedSizes: ['square', 'landscape', 'portrait'],
      outputFormat: 'png',
    },
    cost: { perCallUsd: 0.04 },
    latencyMsP50: 12000,
    async invoke(input) {
      const filePath = input.params.input;
      const prompt = input.params.prompt;

      if (typeof filePath !== 'string' || !filePath.trim()) {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'edit_prompt requires params.input file path', false);
      }
      try {
        await assertWithinInputRoot(filePath);
      } catch (error) {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', error instanceof Error ? error.message : String(error), false);
      }

      if (typeof prompt !== 'string' || !prompt.trim()) {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'edit_prompt requires params.prompt', false);
      }

      if (prompt.length > MAX_PROMPT_LENGTH) {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'edit_prompt prompt exceeds max length 4000', false);
      }

      const requestedSize = input.params.size;
      if (
        requestedSize !== undefined &&
        (typeof requestedSize !== 'string' || !(requestedSize in SIZE_MAP))
      ) {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', `edit_prompt does not support size '${requestedSize}'`, false);
      }
      const size = requestedSize === undefined
        ? undefined
        : SIZE_MAP[requestedSize as keyof typeof SIZE_MAP];

      const timeoutMs = resolveTimeoutMs(input.params);
      const maxRetries = resolveMaxRetries(input.params);
      const retryInitialDelayMs = resolveRetryInitialDelayMs(input.params);

      // Read + encode the source once; reused across retry attempts.
      const source = await fs.promises.readFile(filePath);
      const mimeType = await imageMimeType(source);
      const body = JSON.stringify({
        model,
        images: [{
          image_url: `data:${mimeType};base64,${source.toString('base64')}`,
        }],
        prompt,
        n: 1,
        size,
      });

      const attempt = async (): Promise<{
        kind: 'image';
        buffer: Buffer;
        model: string;
        revisedPrompt?: string;
        metadata: Record<string, unknown>;
      }> => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let response: Response;
        try {
          response = await fetch('https://api.openai.com/v1/images/edits', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            signal: controller.signal,
            body,
          });
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            throw new CapabilityInvokeError('TIMEOUT', `OpenAI edit timed out after ${timeoutMs}ms`, true);
          }
          throw wrapFetchError(error);
        } finally {
          clearTimeout(timer);
        }

        const responseBody = await parseJsonResponse(response);
        if (!response.ok) {
          const isRetryable = response.status >= 500 || response.status === 429;
          throw new CapabilityInvokeError(
            'PROVIDER_FAILURE',
            responseBody.error?.message || `OpenAI edit failed with status ${response.status}`,
            isRetryable,
          );
        }

        const imageData = responseBody.data?.[0];
        if (!imageData?.b64_json) {
          throw new CapabilityInvokeError('PROVIDER_FAILURE', 'No image data returned from OpenAI edit', true);
        }

        const buffer = Buffer.from(imageData.b64_json, 'base64');
        return {
          kind: 'image',
          buffer,
          model,
          revisedPrompt: imageData.revised_prompt,
          metadata: { input: filePath, size: requestedSize },
        };
      };

      let lastError: unknown;
      for (let i = 0; i <= maxRetries; i++) {
        try {
          return await attempt();
        } catch (err) {
          lastError = err;
          if (err instanceof CapabilityInvokeError && !err.retryable) throw err;
          if (i >= maxRetries) throw err;
          await sleep(backoffDelayMs(i, retryInitialDelayMs));
        }
      }
      throw lastError;
    },
  };
}
