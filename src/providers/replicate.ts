import Replicate from 'replicate';
import type { ImageProvider, GenerateParams, GenerateResult, ImageSize } from './index.js';

const ASPECT_RATIO_MAP: Record<ImageSize, string> = {
  square: '1:1',
  landscape: '16:9',
  portrait: '9:16',
};

export class ReplicateProvider implements ImageProvider {
  name = 'replicate' as const;
  defaultModel = 'black-forest-labs/flux-1.1-pro';
  private client: Replicate;

  constructor() {
    const apiToken = process.env.REPLICATE_API_TOKEN;
    if (!apiToken) {
      throw new Error('REPLICATE_API_TOKEN environment variable is required');
    }
    this.client = new Replicate({ auth: apiToken });
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const model = params.model || this.defaultModel;
    const aspectRatio = ASPECT_RATIO_MAP[params.size || 'square'];

    const output = await this.client.run(model as `${string}/${string}`, {
      input: {
        prompt: params.prompt,
        aspect_ratio: aspectRatio,
      },
    });

    // Replicate returns a URL or array of URLs
    const imageUrl = Array.isArray(output) ? output[0] : output;

    if (typeof imageUrl !== 'string') {
      throw new Error('Unexpected response format from Replicate');
    }

    // Fetch the image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image from Replicate: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return {
      buffer,
      model,
    };
  }
}

export function createReplicateProvider(): ImageProvider | null {
  if (!process.env.REPLICATE_API_TOKEN) {
    return null;
  }
  return new ReplicateProvider();
}
