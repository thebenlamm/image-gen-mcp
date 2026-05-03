import * as fs from 'fs';
import sharp from 'sharp';
import { assertWithinInputRoot } from '../utils/path-input-root.js';
import type { Capability } from './types.js';
import { CapabilityInvokeError } from './types.js';

const MODEL_VERSION = 'sharp-palette@1';
const DEFAULT_COUNT = 5;
const MIN_COUNT = 1;
const MAX_COUNT = 16;
const SAMPLE_SIZE = 64;

function toHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, '0')}${g
    .toString(16)
    .padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function createAnalyzePaletteCapability(): Capability {
  return {
    op: 'analyze_palette',
    provider: 'sharp',
    modelVersion: MODEL_VERSION,
    constraints: {
      requiresInputImage: true,
      supportsMultipleInputs: false,
    },
    cost: { perCallUsd: 0 },
    latencyMsP50: 80,
    async invoke(input) {
      const filePath = input.params.input;
      if (typeof filePath !== 'string' || !filePath.trim()) {
        throw new CapabilityInvokeError(
          'CONSTRAINT_VIOLATION',
          'analyze_palette requires params.input file path',
          false,
        );
      }
      try {
        await assertWithinInputRoot(filePath);
      } catch (error) {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', error instanceof Error ? error.message : String(error), false);
      }

      const requestedCount = input.params.count;
      if (
        requestedCount !== undefined &&
        (typeof requestedCount !== 'number' ||
          !Number.isInteger(requestedCount) ||
          requestedCount < MIN_COUNT ||
          requestedCount > MAX_COUNT)
      ) {
        throw new CapabilityInvokeError(
          'CONSTRAINT_VIOLATION',
          'analyze_palette count must be 1-16',
          false,
        );
      }
      const count = requestedCount === undefined ? DEFAULT_COUNT : requestedCount;

      const buffer = await fs.promises.readFile(filePath);
      const { data, info } = await sharp(buffer)
        .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'inside' })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const buckets = new Map<number, { r: number; g: number; b: number; count: number }>();
      for (let offset = 0; offset < data.length; offset += info.channels) {
        const r = data[offset];
        const g = data[offset + 1];
        const b = data[offset + 2];
        const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        const bucket = buckets.get(key);
        if (bucket) {
          bucket.r += r;
          bucket.g += g;
          bucket.b += b;
          bucket.count += 1;
        } else {
          buckets.set(key, { r, g, b, count: 1 });
        }
      }

      const totalPixels = info.width * info.height;
      const colors = Array.from(buckets.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, count)
        .map((bucket) => {
          const r = Math.round(bucket.r / bucket.count);
          const g = Math.round(bucket.g / bucket.count);
          const b = Math.round(bucket.b / bucket.count);
          return {
            hex: toHex(r, g, b),
            r,
            g,
            b,
            weight: bucket.count / totalPixels,
          };
        });

      return {
        kind: 'data',
        data: {
          type: 'palette',
          colors,
        },
        model: MODEL_VERSION,
        metadata: {
          input: filePath,
          requestedCount: count,
          totalSampledPixels: totalPixels,
        },
      };
    },
  };
}
