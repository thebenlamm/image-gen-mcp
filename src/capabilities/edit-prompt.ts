import * as fs from 'fs';
import sharp from 'sharp';
import type { Capability } from './types.js';
import { CapabilityInvokeError } from './types.js';

const MAX_PROMPT_LENGTH = 4000;
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
      const response = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
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

      const responseBody = await response.json() as OpenAIImageEditResponse & {
        error?: { message?: string };
      };
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
