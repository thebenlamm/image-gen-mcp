import type { ImageProvider, GenerateParams, GenerateResult, ImageSize } from './index.js';

const SIZE_MAP: Record<ImageSize, { width: number; height: number }> = {
  square: { width: 1024, height: 1024 },
  landscape: { width: 1440, height: 960 },
  portrait: { width: 960, height: 1440 },
};

export class TogetherProvider implements ImageProvider {
  name = 'together' as const;
  defaultModel = 'black-forest-labs/FLUX.1-schnell';
  supportsSize = true;
  private apiKey: string;

  constructor() {
    const apiKey = process.env.TOGETHER_API_KEY;
    if (!apiKey) {
      throw new Error('TOGETHER_API_KEY environment variable is required');
    }
    this.apiKey = apiKey;
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const model = params.model || this.defaultModel;
    const size = SIZE_MAP[params.size || 'square'];

    const response = await fetch('https://api.together.xyz/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt: params.prompt,
        width: size.width,
        height: size.height,
        n: 1,
        response_format: 'b64_json',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Together AI API error: ${error}`);
    }

    const data = await response.json() as { data: Array<{ b64_json: string }> };

    if (!data.data?.[0]?.b64_json) {
      throw new Error('No image data returned from Together AI');
    }

    const buffer = Buffer.from(data.data[0].b64_json, 'base64');

    return {
      buffer,
      model,
    };
  }
}

export function createTogetherProvider(): ImageProvider | null {
  if (!process.env.TOGETHER_API_KEY) {
    return null;
  }
  return new TogetherProvider();
}
