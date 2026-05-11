import { createGeminiProvider } from '../providers/gemini.js';
import type { Capability } from './types.js';
import { CapabilityInvokeError } from './types.js';

export function createGeminiGenerateCapability(): Capability | null {
  const provider = createGeminiProvider();
  if (!provider) {
    return null;
  }

  return {
    op: 'generate',
    provider: 'gemini',
    modelVersion: provider.defaultModel,
    constraints: {
      requiresInputImage: false,
      supportsMultipleInputs: false,
      maxPromptLength: 32000,
      supportedSizes: ['square', 'landscape', 'portrait'],
      outputFormat: 'png',
    },
    cost: { perCallUsd: 0.03 }, // approximate — based on provider pricing page 2026-05
    latencyMsP50: 4000, // approximate — based on provider pricing page 2026-05
    quality: {
      unscoredJustification:
        'v1 text-to-image provider in production via generate_image; routing parity with v1 surface is a transparency gate, not a quality gate. Eval cases pending future milestone.',
    },
    async invoke(input) {
      const prompt = input.params.prompt;
      if (typeof prompt !== 'string' || !prompt.trim()) {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'generate requires params.prompt', false);
      }
      try {
        const result = await provider.generate({
          prompt,
          size: input.params.size as 'square' | 'landscape' | 'portrait' | undefined,
        });
        return {
          kind: 'image',
          buffer: result.buffer,
          model: result.model,
          metadata: { prompt, provider: 'gemini', modelVersion: result.model, qualityMeasured: false },
        };
      } catch (error) {
        if (error instanceof CapabilityInvokeError) throw error;
        throw new CapabilityInvokeError(
          'PROVIDER_FAILURE',
          error instanceof Error ? error.message : String(error),
          true,
        );
      }
    },
  };
}
