import * as fs from 'fs';
import sharp from 'sharp';
import type { Capability } from './types.js';
import { CapabilityInvokeError } from './types.js';

const MODEL_VERSION = 'sharp-composite@1';
const MAX_LAYERS = 16;
const MAX_CANVAS_PIXELS = 16_000_000;
const MIN_SCALE = 0.05;
const MAX_SCALE = 10;

type Anchor = 'top-left' | 'center' | 'top-right' | 'bottom-left' | 'bottom-right';

interface CompositeLayer {
  input: string;
  x?: number;
  y?: number;
  scale?: number;
  opacity?: number;
  anchor?: Anchor;
}

interface CompositeCanvas {
  width: number;
  height: number;
  background?: sharp.Color;
}

function resolveAnchor(
  layer: CompositeLayer,
  info: { width: number; height: number },
): { left: number; top: number } {
  const x = layer.x ?? 0;
  const y = layer.y ?? 0;

  switch (layer.anchor ?? 'top-left') {
    case 'center':
      return { left: Math.round(x - info.width / 2), top: Math.round(y - info.height / 2) };
    case 'top-right':
      return { left: Math.round(x - info.width), top: Math.round(y) };
    case 'bottom-left':
      return { left: Math.round(x), top: Math.round(y - info.height) };
    case 'bottom-right':
      return { left: Math.round(x - info.width), top: Math.round(y - info.height) };
    case 'top-left':
    default:
      return { left: Math.round(x), top: Math.round(y) };
  }
}

async function applyOpacity(
  pipeline: sharp.Sharp,
  opacity: number,
): Promise<sharp.Sharp> {
  const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);

  for (let offset = 3; offset < out.length; offset += 4) {
    out[offset] = Math.round(out[offset] * opacity);
  }

  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } });
}

export function createCompositeLayersCapability(): Capability {
  return {
    op: 'composite_layers',
    provider: 'sharp',
    modelVersion: MODEL_VERSION,
    constraints: {
      requiresInputImage: false,
      supportsMultipleInputs: true,
      outputFormat: 'png',
    },
    cost: { perCallUsd: 0 },
    latencyMsP50: 400,
    async invoke(input) {
      const { canvas, layers } = input.params as {
        canvas?: CompositeCanvas;
        layers?: CompositeLayer[];
      };

      if (!canvas || typeof canvas.width !== 'number' || typeof canvas.height !== 'number') {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'composite_layers requires canvas.width and canvas.height', false);
      }
      if (canvas.width * canvas.height > MAX_CANVAS_PIXELS) {
        throw new CapabilityInvokeError('INPUT_TOO_LARGE', 'composite_layers canvas exceeds 16MP cap', false);
      }
      if (!Array.isArray(layers) || layers.length === 0) {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'composite_layers requires at least one layer', false);
      }
      if (layers.length > MAX_LAYERS) {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', `composite_layers layers exceed cap of ${MAX_LAYERS}`, false);
      }

      const overlays = await Promise.all(layers.map(async (layer, index) => {
        const scale = layer.scale ?? 1;
        if (scale < MIN_SCALE || scale > MAX_SCALE) {
          throw new CapabilityInvokeError(
            'CONSTRAINT_VIOLATION',
            `composite_layers.layers[${index}].scale must be between ${MIN_SCALE} and ${MAX_SCALE}`,
            false,
          );
        }
        if (layer.opacity !== undefined && (layer.opacity < 0 || layer.opacity > 1)) {
          throw new CapabilityInvokeError(
            'CONSTRAINT_VIOLATION',
            `composite_layers.layers[${index}].opacity must be between 0 and 1`,
            false,
          );
        }
        if (typeof layer.input !== 'string' || !layer.input.trim()) {
          throw new CapabilityInvokeError(
            'CONSTRAINT_VIOLATION',
            `composite_layers.layers[${index}].input must be a non-empty string`,
            false,
          );
        }

        const layerBuffer = await fs.promises.readFile(layer.input);
        let pipeline = sharp(layerBuffer);
        if (scale !== 1) {
          const meta = await sharp(layerBuffer).metadata();
          if (!meta.width || !meta.height) {
            throw new CapabilityInvokeError(
              'PROVIDER_FAILURE',
              `composite_layers.layers[${index}] has invalid dimensions`,
              false,
            );
          }
          pipeline = pipeline.resize(
            Math.round(meta.width * scale),
            Math.round(meta.height * scale),
            { fit: 'fill' },
          );
        }

        if (layer.opacity !== undefined && layer.opacity < 1) {
          // Opacity is handled by multiplying the prepared layer alpha channel.
          pipeline = await applyOpacity(pipeline, layer.opacity);
        }

        const prepared = await pipeline.png().toBuffer({ resolveWithObject: true });
        const position = resolveAnchor(layer, prepared.info);
        return {
          input: prepared.data,
          left: position.left,
          top: position.top,
        };
      }));

      const buffer = await sharp({
        create: {
          width: canvas.width,
          height: canvas.height,
          channels: 4,
          background: canvas.background ?? { r: 0, g: 0, b: 0, alpha: 0 },
        },
      }).composite(overlays).png().toBuffer();

      return {
        kind: 'image',
        buffer,
        model: MODEL_VERSION,
        metadata: {
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          layerCount: layers.length,
        },
      };
    },
  };
}
