import * as fs from 'fs';
import sharp from 'sharp';
import { assertWithinInputRoot } from '../utils/path-input-root.js';
import type { Capability } from './types.js';
import { CapabilityInvokeError } from './types.js';

const MODEL_VERSION = 'fal-ai/flux-pro/kontext';
const ENDPOINT = 'https://queue.fal.run/fal-ai/flux-pro/kontext';
const MAX_PROMPT_LENGTH = 4000;
const FETCH_TIMEOUT_MS = 30_000;
const FETCH_RETRIES = 1;
const POLL_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 2_000;

interface FalQueueResponse {
  request_id?: string;
  requestId?: string;
  status?: string;
  status_url?: string;
  response_url?: string;
  images?: Array<{ url?: string }>;
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
          `fal image URL fetch failed after ${retries + 1} attempts: ${error instanceof Error ? error.message : String(error)}`,
          true,
        );
      }
    }
  }

  throw new CapabilityInvokeError('PROVIDER_FAILURE', 'unreachable', true);
}

async function parseJsonResponse(response: Response): Promise<FalQueueResponse> {
  const rawBody = await response.text();
  if (!rawBody.trim()) {
    return {};
  }
  try {
    return JSON.parse(rawBody) as FalQueueResponse;
  } catch {
    throw new CapabilityInvokeError('PROVIDER_FAILURE', `fal returned non-JSON response: ${rawBody.slice(0, 500)}`, true);
  }
}

function imageMimeType(format: string | undefined): string {
  if (format === 'png') return 'image/png';
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'webp') return 'image/webp';
  throw new CapabilityInvokeError('UNSUPPORTED', `edit_prompt unsupported input format '${format ?? 'unknown'}'`, false);
}

function requestId(response: FalQueueResponse): string | undefined {
  return response.request_id ?? response.requestId;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchFalJson(url: string, apiKey: string): Promise<FalQueueResponse> {
  const response = await fetch(url, { headers: { Authorization: `Key ${apiKey}` } });
  const body = await parseJsonResponse(response);
  if (!response.ok) {
    throw new CapabilityInvokeError('PROVIDER_FAILURE', `fal request failed with status ${response.status}`, true);
  }
  return body;
}

async function resolveFalResult(submitBody: FalQueueResponse, apiKey: string): Promise<FalQueueResponse> {
  if (submitBody.images?.length) {
    return submitBody;
  }

  const statusUrl = submitBody.status_url;
  const responseUrl = submitBody.response_url;
  if (!statusUrl || !responseUrl) {
    throw new CapabilityInvokeError('PROVIDER_FAILURE', 'fal returned no result URL or queue status URL', true);
  }

  const started = Date.now();
  while (Date.now() - started <= POLL_TIMEOUT_MS) {
    const status = await fetchFalJson(statusUrl, apiKey);
    if (status.status === 'COMPLETED') {
      return fetchFalJson(responseUrl, apiKey);
    }
    if (status.status === 'FAILED' || status.status === 'ERROR') {
      throw new CapabilityInvokeError('PROVIDER_FAILURE', `fal queue failed with status ${status.status}`, true);
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new CapabilityInvokeError('TIMEOUT', 'fal queue timed out after 60s', true);
}

function getOutputUrl(output: FalQueueResponse): string {
  const url = output.images?.[0]?.url;
  if (typeof url !== 'string' || !url.trim()) {
    throw new CapabilityInvokeError('PROVIDER_FAILURE', 'fal returned no image URL', true);
  }
  return url;
}

export function createFalEditPromptCapability(): Capability | null {
  const apiKey = resolveOptionalEnv(process.env.FAL_KEY);
  if (!apiKey) {
    return null;
  }

  return {
    op: 'edit_prompt',
    provider: 'fal',
    modelVersion: MODEL_VERSION,
    constraints: {
      requiresInputImage: true,
      supportsMultipleInputs: false,
      maxPromptLength: MAX_PROMPT_LENGTH,
      supportedSizes: ['square', 'landscape', 'portrait'],
      outputFormat: 'png',
    },
    cost: { perCallUsd: 0.04 },
    latencyMsP50: 6000,
    quality: {
      unscoredJustification: 'Phase 11 initial registration; eval scores pending from fal-flux-kontext eval cases (D-12, PROV-05)',
    },
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

      const source = await fs.promises.readFile(filePath);
      const meta = await sharp(source).metadata();
      const mimeType = imageMimeType(meta.format);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), POLL_TIMEOUT_MS);
      let submitResponse: Response;
      try {
        submitResponse = await fetch(ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Key ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            image_url: `data:${mimeType};base64,${source.toString('base64')}`,
            prompt,
            output_format: 'png',
          }),
          signal: controller.signal,
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new CapabilityInvokeError('TIMEOUT', 'fal submit timed out after 60s', true);
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }

      const submitBody = await parseJsonResponse(submitResponse);
      if (!submitResponse.ok) {
        throw new CapabilityInvokeError('PROVIDER_FAILURE', `fal submit failed with status ${submitResponse.status}`, true);
      }

      const result = await resolveFalResult(submitBody, apiKey);
      const buffer = await fetchWithTimeoutRetry(getOutputUrl(result), FETCH_TIMEOUT_MS, FETCH_RETRIES);

      return {
        kind: 'image',
        buffer,
        model: MODEL_VERSION,
        revisedPrompt: undefined,
        metadata: {
          input: filePath,
          provider: 'fal',
          modelVersion: MODEL_VERSION,
          requestId: requestId(submitBody),
          qualityMeasured: false,
        },
      };
    },
  };
}
