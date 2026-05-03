import * as fs from 'fs';
import sharp from 'sharp';
import { assertWithinInputRoot } from '../utils/path-input-root.js';
import type { Capability } from './types.js';
import { CapabilityInvokeError } from './types.js';

const MAX_PROMPT_LENGTH = 4000;
const FETCH_TIMEOUT_MS = 30_000;
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

      const source = await fs.promises.readFile(filePath);
      const mimeType = await imageMimeType(source);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch('https://api.openai.com/v1/images/edits', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
          body: JSON.stringify({
            model,
            images: [{
              image_url: `data:${mimeType};base64,${source.toString('base64')}`,
            }],
            prompt,
            n: 1,
            size,
          }),
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new CapabilityInvokeError('TIMEOUT', 'OpenAI edit timed out after 30s', true);
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }

      const responseBody = await parseJsonResponse(response);
      if (!response.ok) {
        throw new CapabilityInvokeError(
          'PROVIDER_FAILURE',
          responseBody.error?.message || `OpenAI edit failed with status ${response.status}`,
          true,
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
    },
  };
}
