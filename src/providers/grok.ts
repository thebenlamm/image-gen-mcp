import type { ImageProvider, GenerateParams, GenerateResult } from './index.js';

export class GrokProvider implements ImageProvider {
  name = 'grok' as const;
  defaultModel = 'grok-2-image';
  supportsSize = false;
  private apiKey: string;

  constructor() {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      throw new Error('XAI_API_KEY environment variable is required');
    }
    this.apiKey = apiKey;
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const model = params.model || this.defaultModel;

    // xAI uses OpenAI-compatible API format
    const response = await fetch('https://api.x.ai/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt: params.prompt,
        n: 1,
        response_format: 'b64_json',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`xAI API error: ${error}`);
    }

    const data = await response.json() as { data: Array<{ b64_json: string }> };

    if (!data.data?.[0]?.b64_json) {
      throw new Error('No image data returned from xAI');
    }

    const buffer = Buffer.from(data.data[0].b64_json, 'base64');

    return {
      buffer,
      model,
    };
  }
}

export function createGrokProvider(): ImageProvider | null {
  if (!process.env.XAI_API_KEY) {
    return null;
  }
  return new GrokProvider();
}
