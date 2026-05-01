import * as fs from 'fs';
import OpenAI, { toFile } from 'openai';
import type { Capability } from './types.js';

const MAX_PROMPT_LENGTH = 4000;

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

      const source = await fs.promises.readFile(filePath);
      const response = await client.images.edit({
        model,
        image: await toFile(source, filePath),
        prompt,
        n: 1,
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
        metadata: { input: filePath },
      };
    },
  };
}
