import * as fs from 'fs';
import sharp from 'sharp';
import { assertWithinInputRoot } from '../utils/path-input-root.js';
import type { Capability } from './types.js';
import { CapabilityInvokeError } from './types.js';

const MODEL_VERSION = 'sharp-metadata@1';

export function createAnalyzeDimensionsCapability(): Capability {
  return {
    op: 'analyze_dimensions',
    provider: 'sharp',
    modelVersion: MODEL_VERSION,
    constraints: {
      requiresInputImage: true,
      supportsMultipleInputs: false,
    },
    cost: { perCallUsd: 0 },
    latencyMsP50: 30,
    async invoke(input) {
      const filePath = input.params.input;
      if (typeof filePath !== 'string' || !filePath.trim()) {
        throw new CapabilityInvokeError(
          'CONSTRAINT_VIOLATION',
          'analyze_dimensions requires params.input file path',
          false,
        );
      }
      try {
        await assertWithinInputRoot(filePath);
      } catch (error) {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', error instanceof Error ? error.message : String(error), false);
      }

      const buffer = await fs.promises.readFile(filePath);
      const meta = await sharp(buffer).metadata();
      if (!meta.width || !meta.height) {
        throw new CapabilityInvokeError(
          'PROVIDER_FAILURE',
          'sharp returned no dimensions',
          false,
        );
      }

      return {
        kind: 'data',
        data: {
          type: 'dimensions',
          width: meta.width,
          height: meta.height,
          format: meta.format ?? 'unknown',
          channels: meta.channels ?? 0,
          hasAlpha: meta.hasAlpha ?? false,
        },
        model: MODEL_VERSION,
        metadata: { input: filePath },
      };
    },
  };
}
