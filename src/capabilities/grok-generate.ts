import { createGrokProvider } from '../providers/grok.js';
import type { Capability } from './types.js';
import { CapabilityInvokeError } from './types.js';

const MAX_PROMPT_LENGTH = 1024;

export function createGrokGenerateCapability(): Capability | null {
  const provider = createGrokProvider();
  if (!provider) {
    return null;
  }

  return {
    op: 'generate',
    provider: 'grok',
    modelVersion: provider.defaultModel,
    constraints: {
      requiresInputImage: false,
      supportsMultipleInputs: false,
      maxPromptLength: MAX_PROMPT_LENGTH,
      supportedSizes: ['square', 'landscape', 'portrait'],
      outputFormat: 'png',
    },
    cost: { perCallUsd: 0.02 }, // approximate — based on provider pricing page 2026-05
    latencyMsP50: 5000, // approximate — based on provider pricing page 2026-05
    quality: {
      unscoredJustification:
        'v1 text-to-image provider in production via generate_image; routing parity with v1 surface is a transparency gate, not a quality gate. Eval cases pending future milestone.',
    },
    async invoke(input) {
      const prompt = input.params.prompt;
      if (typeof prompt !== 'string' || !prompt.trim()) {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'generate requires params.prompt', false);
      }
      // Runtime enforcement of Grok's 1024-char hard limit.
      // This is required because image_op callers bypass the planner's constraint check.
      if (prompt.length > MAX_PROMPT_LENGTH) {
        throw new CapabilityInvokeError(
          'CONSTRAINT_VIOLATION',
          `generate prompt exceeds Grok max length 1024 (${prompt.length} chars)`,
          false,
        );
      }

      let result: { buffer: Buffer; model: string; revisedPrompt?: string };
      try {
        result = await provider.generate({
          prompt,
          size: input.params.size as 'square' | 'landscape' | 'portrait' | undefined,
        });
      } catch (error) {
        if (error instanceof CapabilityInvokeError) {
          throw error;
        }
        throw new CapabilityInvokeError(
          'PROVIDER_FAILURE',
          error instanceof Error ? error.message : String(error),
          true,
        );
      }

      // Grok does not return a revisedPrompt.
      return {
        kind: 'image',
        buffer: result.buffer,
        model: result.model,
        metadata: {
          prompt,
          provider: 'grok',
          modelVersion: result.model,
          qualityMeasured: false,
        },
      };
    },
  };
}
