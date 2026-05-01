import * as fs from 'fs';
import * as path from 'path';
import OpenAI, { toFile } from 'openai';
import type { Capability } from './types.js';

const MAX_PROMPT_LENGTH = 4000;
const SIZE_MAP = {
  square: '1024x1024',
  landscape: '1536x1024',
  portrait: '1024x1536',
} as const;

export function createEditPromptCapability(): Capability | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  const model = process.env.OPENAI_DEFAULT_MODEL?.trim() || 'gpt-image-1';
  const client = new OpenAI({ apiKey });

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
        throw new Error('edit_prompt requires params.input file path');
      }

      if (typeof prompt !== 'string' || !prompt.trim()) {
        throw new Error('edit_prompt requires params.prompt');
      }

      if (prompt.length > MAX_PROMPT_LENGTH) {
        throw new Error('edit_prompt prompt exceeds max length 4000');
      }

      const requestedSize = input.params.size;
      if (
        requestedSize !== undefined &&
        (typeof requestedSize !== 'string' || !(requestedSize in SIZE_MAP))
      ) {
        throw new Error(`edit_prompt does not support size '${requestedSize}'`);
      }
      const size = requestedSize === undefined
        ? undefined
        : SIZE_MAP[requestedSize as keyof typeof SIZE_MAP];

      const source = await fs.promises.readFile(filePath);
      const response = await client.images.edit({
        model,
        image: await toFile(source, path.basename(filePath)),
        prompt,
        n: 1,
        size,
      });

      const imageData = response.data?.[0];
      if (!imageData?.b64_json) {
        throw new Error('No image data returned from OpenAI edit');
      }

      const buffer = Buffer.from(imageData.b64_json, 'base64');

      return {
        buffer,
        model,
        revisedPrompt: imageData.revised_prompt,
        metadata: { input: filePath, size: requestedSize },
      };
    },
  };
}
