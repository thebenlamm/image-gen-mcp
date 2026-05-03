import * as fs from 'fs';
import sharp from 'sharp';
import { assertWithinInputRoot } from '../utils/path-input-root.js';
import type { Capability } from './types.js';
import { CapabilityInvokeError } from './types.js';

const MODEL_VERSION = 'sharp-composite@1';
const MAX_LAYERS = 16;
const MAX_CANVAS_PIXELS = 16_000_000;
const MAX_LAYER_PIXELS = 16_000_000;
const MIN_SCALE = 0.05;
const MAX_SCALE = 10;
const ANCHORS = new Set(['top-left', 'center', 'top-right', 'bottom-left', 'bottom-right']);

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

function finiteNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', `${name} must be a finite number`, false);
  }
  return value;
}

function optionalFiniteNumber(value: unknown, name: string, fallback: number): number {
  return value === undefined ? fallback : finiteNumber(value, name);
}

function validateAnchor(value: unknown, name: string): Anchor {
  const anchor = value ?? 'top-left';
  if (typeof anchor !== 'string' || !ANCHORS.has(anchor)) {
    throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', `${name} must be one of ${Array.from(ANCHORS).join(', ')}`, false);
  }
  return anchor as Anchor;
}

function resolveAnchor(
  layer: Required<Pick<CompositeLayer, 'x' | 'y' | 'anchor'>>,
  info: { width: number; height: number },
): { left: number; top: number } {
  const { x, y } = layer;

  switch (layer.anchor) {
    case 'center':
      return { left: Math.round(x - info.width / 2), top: Math.round(y - info.height / 2) };
    case 'top-right':
      return { left: Math.round(x - info.width), top: Math.round(y) };
    case 'bottom-left':
      return { left: Math.round(x), top: Math.round(y - info.height) };
    case 'bottom-right':
      return { left: Math.round(x - info.width), top: Math.round(y - info.height) };
    case 'top-left':
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
      finiteNumber(canvas.width, 'composite_layers.canvas.width');
      finiteNumber(canvas.height, 'composite_layers.canvas.height');
      if (!Number.isInteger(canvas.width) || !Number.isInteger(canvas.height)) {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'composite_layers canvas dimensions must be integer pixels', false);
      }
      if (canvas.width <= 0 || canvas.height <= 0) {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'composite_layers canvas dimensions must be positive', false);
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
      for (const layer of layers) {
        try {
          await assertWithinInputRoot(layer.input);
        } catch (error) {
          throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', error instanceof Error ? error.message : String(error), false);
        }
      }

      const overlays = await Promise.all(layers.map(async (layer, index) => {
        const scale = optionalFiniteNumber(layer.scale, `composite_layers.layers[${index}].scale`, 1);
        if (scale < MIN_SCALE || scale > MAX_SCALE) {
          throw new CapabilityInvokeError(
            'CONSTRAINT_VIOLATION',
            `composite_layers.layers[${index}].scale must be between ${MIN_SCALE} and ${MAX_SCALE}`,
            false,
          );
        }
        const opacity = optionalFiniteNumber(layer.opacity, `composite_layers.layers[${index}].opacity`, 1);
        if (opacity < 0 || opacity > 1) {
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
        const anchor = validateAnchor(layer.anchor, `composite_layers.layers[${index}].anchor`);
        const x = optionalFiniteNumber(layer.x, `composite_layers.layers[${index}].x`, 0);
        const y = optionalFiniteNumber(layer.y, `composite_layers.layers[${index}].y`, 0);

        const layerBuffer = await fs.promises.readFile(layer.input);
        const meta = await sharp(layerBuffer, { limitInputPixels: MAX_LAYER_PIXELS }).metadata();
        if (!meta.width || !meta.height) {
          throw new CapabilityInvokeError(
            'PROVIDER_FAILURE',
            `composite_layers.layers[${index}] has invalid dimensions`,
            false,
          );
        }
        const width = Math.round(meta.width * scale);
        const height = Math.round(meta.height * scale);
        if (width < 1 || height < 1) {
          throw new CapabilityInvokeError(
            'CONSTRAINT_VIOLATION',
            `composite_layers.layers[${index}].scale produces a zero-sized layer`,
            false,
          );
        }
        if (width * height > MAX_LAYER_PIXELS) {
          throw new CapabilityInvokeError(
            'INPUT_TOO_LARGE',
            `composite_layers.layers[${index}] exceeds 16MP layer cap after scaling`,
            false,
          );
        }

        let pipeline = sharp(layerBuffer, { limitInputPixels: MAX_LAYER_PIXELS });
        if (scale !== 1) {
          pipeline = pipeline.resize(width, height, { fit: 'fill' });
        }

        if (opacity < 1) {
          // Opacity is handled by multiplying the prepared layer alpha channel.
          pipeline = await applyOpacity(pipeline, opacity);
        }

        const prepared = await pipeline.png().toBuffer({ resolveWithObject: true });
        const position = resolveAnchor({ x, y, anchor }, prepared.info);
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
