import OpenAI from 'openai';
import type { ImageProvider, GenerateParams, GenerateResult, ImageSize } from './index.js';

const SIZE_MAP: Record<ImageSize, string> = {
  square: '1024x1024',
  landscape: '1536x1024',
  portrait: '1024x1536',
};

// 300s matches edit_prompt's timeout_ms ceiling; slow gpt-image renders
// must not be cut off and re-billed by the SDK's retry-after-timeout.
const OPENAI_TIMEOUT_MS = 300_000;
const OPENAI_MAX_RETRIES = 2;

export class OpenAIProvider implements ImageProvider {
  name = 'openai' as const;
  defaultModel: string;
  supportsSize = true;
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    this.defaultModel = process.env.OPENAI_DEFAULT_MODEL?.trim() || 'gpt-image-1';
    // Explicit bounds: the SDK default timeout is 10 minutes per attempt.
    this.client = new OpenAI({ apiKey, timeout: OPENAI_TIMEOUT_MS, maxRetries: OPENAI_MAX_RETRIES });
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const model = params.model || this.defaultModel;
    const size = SIZE_MAP[params.size || 'square'];

    const response = await this.client.images.generate({
      model,
      prompt: params.prompt,
      n: 1,
      size: size as '1024x1024' | '1536x1024' | '1024x1536',
    });

    const imageData = response.data?.[0];
    if (!imageData?.b64_json) {
      throw new Error('No image data returned from OpenAI');
    }

    const buffer = Buffer.from(imageData.b64_json, 'base64');

    return {
      buffer,
      model,
      revisedPrompt: imageData.revised_prompt,
    };
  }
}

export function createOpenAIProvider(): ImageProvider | null {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return null;
  }
  return new OpenAIProvider();
}
