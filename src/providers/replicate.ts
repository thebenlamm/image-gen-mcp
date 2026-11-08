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
  supportsSize = true;
  private client: Replicate;

  constructor() {
    const apiToken = process.env.REPLICATE_API_TOKEN?.trim();
    if (!apiToken) {
      throw new Error('REPLICATE_API_TOKEN environment variable is required');
    }
    // useFileOutput:false — replicate>=1.0 otherwise returns FileOutput streams,
    // not URL strings, and generate() below rejects every successful run.
    this.client = new Replicate({ auth: apiToken, useFileOutput: false });
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const model = params.model || this.defaultModel;
    const aspectRatio = ASPECT_RATIO_MAP[params.size || 'square'];

    const output = await this.client.run(model as `${string}/${string}`, {
      input: {
        prompt: params.prompt,
        aspect_ratio: aspectRatio,
      },
      // Aborting cancels the prediction server-side (replicate SDK run()).
      signal: AbortSignal.timeout(300_000),
    });

    // Replicate returns a URL or array of URLs
    const imageUrl = Array.isArray(output) ? output[0] : output;

    if (typeof imageUrl !== 'string') {
      throw new Error('Unexpected response format from Replicate');
    }

    // Fetch the image
    const response = await fetch(imageUrl, { signal: AbortSignal.timeout(60_000) });
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
  if (!process.env.REPLICATE_API_TOKEN?.trim()) {
    return null;
  }
  return new ReplicateProvider();
}
