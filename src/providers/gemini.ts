import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ImageProvider, GenerateParams, GenerateResult, ImageSize } from './index.js';

const ASPECT_RATIO_MAP: Record<ImageSize, string> = {
  square: '1:1',
  landscape: '16:9',
  portrait: '9:16',
};

export class GeminiProvider implements ImageProvider {
  name = 'gemini' as const;
  defaultModel = 'imagen-3.0-generate-002';
  private client: GoogleGenerativeAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const model = params.model || this.defaultModel;
    const aspectRatio = ASPECT_RATIO_MAP[params.size || 'square'];

    // Use the Imagen model for image generation
    const imagenModel = this.client.getGenerativeModel({
      model,
    });

    const response = await imagenModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: params.prompt }] }],
      generationConfig: {
        // @ts-expect-error - Imagen-specific config
        responseModalities: ['image'],
        aspectRatio,
      },
    });

    const result = response.response;
    const candidate = result.candidates?.[0];

    if (!candidate?.content?.parts?.[0]) {
      throw new Error('No image data returned from Gemini');
    }

    const part = candidate.content.parts[0];
    if (!('inlineData' in part) || !part.inlineData?.data) {
      throw new Error('No image data in Gemini response');
    }

    const buffer = Buffer.from(part.inlineData.data, 'base64');

    return {
      buffer,
      model,
    };
  }
}

export function createGeminiProvider(): ImageProvider | null {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }
  return new GeminiProvider();
}
