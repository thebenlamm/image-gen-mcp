import { GoogleGenAI } from '@google/genai';
import type { ImageProvider, GenerateParams, GenerateResult, ImageSize } from './index.js';

const ASPECT_RATIO_MAP: Record<ImageSize, string> = {
  square: '1:1',
  landscape: '16:9',
  portrait: '9:16',
};

export class GeminiProvider implements ImageProvider {
  name = 'gemini' as const;
  defaultModel = 'gemini-2.5-flash-preview-05-20';
  supportsSize = true;
  private client: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    this.client = new GoogleGenAI({ apiKey });
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const model = params.model || this.defaultModel;
    const aspectRatio = ASPECT_RATIO_MAP[params.size || 'square'];

    const config: Record<string, unknown> = {
      responseModalities: ['TEXT', 'IMAGE'],
    };

    if (aspectRatio) {
      config.imageConfig = {
        aspectRatio,
      };
    }

    const response = await this.client.models.generateContent({
      model,
      contents: params.prompt,
      config,
    });

    const candidates = response.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error('No candidates returned from Gemini');
    }

    const parts = candidates[0].content?.parts;
    if (!parts) {
      throw new Error('No content parts in Gemini response');
    }

    for (const part of parts) {
      if ('inlineData' in part && part.inlineData?.data) {
        const buffer = Buffer.from(part.inlineData.data, 'base64');
        return {
          buffer,
          model,
        };
      }
    }

    throw new Error('No image data found in Gemini response');
  }
}

export function createGeminiProvider(): ImageProvider | null {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    return null;
  }
  return new GeminiProvider();
}
