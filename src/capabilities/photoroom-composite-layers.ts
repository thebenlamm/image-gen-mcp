import * as fs from 'fs';
import sharp from 'sharp';
import { assertWithinInputRoot } from '../utils/path-input-root.js';
import type { Capability } from './types.js';
import { CapabilityInvokeError } from './types.js';

const MODEL_VERSION = 'photoroom-image-editing-v1';
const FETCH_TIMEOUT_MS = 60_000;
const ENDPOINT = 'https://image-api.photoroom.com/v2/edit';
const MAX_LAYERS = 16;
const MAX_CANVAS_PIXELS = 16_000_000;
const ANCHORS = new Set(['top-left', 'center', 'top-right', 'bottom-left', 'bottom-right']);

interface PhotoroomCompositeLayer {
  input: string;
  x?: number;
  y?: number;
  scale?: number;
  opacity?: number;
  anchor?: string;
}

interface PhotoroomCompositeParams {
  canvas?: {
    width?: number;
    height?: number;
    background?: unknown;
  };
  layers?: PhotoroomCompositeLayer[];
  shadow?: {
    enabled?: boolean;
    mode?: string;
  };
  background?: {
    color?: string;
    prompt?: string;
  };
}

function resolveOptionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || /^\$\{[^}]+\}$/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

function finiteNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', `${name} must be a finite number`, false);
  }
  return value;
}

async function imageMimeType(buffer: Buffer): Promise<string> {
  const format = (await sharp(buffer).metadata()).format;
  if (format === 'png') return 'image/png';
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'webp') return 'image/webp';
  throw new CapabilityInvokeError('UNSUPPORTED', `composite_layers unsupported input format '${format ?? 'unknown'}'`, false);
}

async function validateParams(params: PhotoroomCompositeParams): Promise<{ canvas: { width: number; height: number }; layers: PhotoroomCompositeLayer[] }> {
  const { canvas, layers } = params;
  if (!canvas || typeof canvas.width !== 'number' || typeof canvas.height !== 'number') {
    throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'composite_layers requires canvas.width and canvas.height', false);
  }
  const width = finiteNumber(canvas.width, 'composite_layers.canvas.width');
  const height = finiteNumber(canvas.height, 'composite_layers.canvas.height');
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'composite_layers canvas dimensions must be integer pixels', false);
  }
  if (width <= 0 || height <= 0) {
    throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'composite_layers canvas dimensions must be positive', false);
  }
  if (width * height > MAX_CANVAS_PIXELS) {
    throw new CapabilityInvokeError('INPUT_TOO_LARGE', 'composite_layers canvas exceeds 16MP cap', false);
  }
  if (!Array.isArray(layers) || layers.length === 0) {
    throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'composite_layers requires at least one layer', false);
  }
  if (layers.length !== 1) {
    throw new CapabilityInvokeError(
      'CONSTRAINT_VIOLATION',
      `composite_layers:photoroom currently supports exactly one subject layer (got ${layers.length}); Photoroom Image Editing API does not accept multi-layer composition. Use composite_layers:sharp for multi-layer local composition.`,
      false,
    );
  }
  if (layers.length > MAX_LAYERS) {
    throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', `composite_layers layers exceed cap of ${MAX_LAYERS}`, false);
  }
  for (let index = 0; index < layers.length; index += 1) {
    const layer = layers[index];
    if (typeof layer.input !== 'string' || !layer.input.trim()) {
      throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', `composite_layers.layers[${index}].input must be a non-empty string`, false);
    }
    try {
      await assertWithinInputRoot(layer.input);
    } catch (error) {
      throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', error instanceof Error ? error.message : String(error), false);
    }
    if (layer.x !== undefined) finiteNumber(layer.x, `composite_layers.layers[${index}].x`);
    if (layer.y !== undefined) finiteNumber(layer.y, `composite_layers.layers[${index}].y`);
    if (layer.scale !== undefined) {
      const scale = finiteNumber(layer.scale, `composite_layers.layers[${index}].scale`);
      if (scale < 0.05 || scale > 10) {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', `composite_layers.layers[${index}].scale must be between 0.05 and 10`, false);
      }
    }
    if (layer.opacity !== undefined) {
      const opacity = finiteNumber(layer.opacity, `composite_layers.layers[${index}].opacity`);
      if (opacity < 0 || opacity > 1) {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', `composite_layers.layers[${index}].opacity must be between 0 and 1`, false);
      }
    }
    if (layer.anchor !== undefined && !ANCHORS.has(layer.anchor)) {
      throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', `composite_layers.layers[${index}].anchor is invalid`, false);
    }
  }
  return { canvas: { width, height }, layers };
}

export function createPhotoroomCompositeLayersCapability(): Capability | null {
  const apiKey = resolveOptionalEnv(process.env.PHOTOROOM_API_KEY);
  if (!apiKey) {
    return null;
  }

  return {
    op: 'composite_layers',
    provider: 'photoroom',
    modelVersion: MODEL_VERSION,
    constraints: {
      requiresInputImage: false,
      supportsMultipleInputs: false,
      outputFormat: 'png',
    },
    cost: { perCallUsd: 0.05 },
    latencyMsP50: 5000,
    quality: {
      unscoredJustification: 'Phase 11 initial registration; eval scores pending from photoroom composite_layers eval cases - measures shadow/background quality per D-15 (D-12, PROV-05, PROV-01 (with shadow))',
    },
    async invoke(input) {
      const params = input.params as PhotoroomCompositeParams;
      const { canvas, layers } = await validateParams(params);
      const source = await fs.promises.readFile(layers[0].input);
      const mimeType = await imageMimeType(source);
      const form = new FormData();
      form.set('imageFile', new Blob([source as BlobPart], { type: mimeType }), 'input');
      form.set('removeBackground', 'true');
      form.set('export.format', 'png');
      form.set('outputSize', `${canvas.width}x${canvas.height}`);
      form.set('padding', '0');
      // Note: layers[0].x, .y, .scale, .opacity, and .anchor are accepted at the
      // schema level for forward compatibility with the sharp composite_layers
      // adapter (D-28: same plan can target either provider). Photoroom's Image
      // Editing API positions the subject via outputSize + padding + (optional)
      // background; per-layer placement fields are intentionally NOT forwarded.
      // If multi-layer placement is needed, route through composite_layers:sharp.
      if (params.shadow?.enabled) {
        form.set('shadow.mode', params.shadow.mode ?? 'ai.soft');
      }
      if (typeof params.background?.color === 'string') {
        form.set('background.color', params.background.color.replace(/^#/, ''));
      }
      if (typeof params.background?.prompt === 'string') {
        form.set('background.prompt', params.background.prompt);
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'x-api-key': apiKey },
          body: form,
          signal: controller.signal,
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new CapabilityInvokeError('TIMEOUT', 'Photoroom image editing timed out after 60s', true);
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new CapabilityInvokeError(
          'PROVIDER_FAILURE',
          body.trim() || `Photoroom image editing failed with status ${response.status}`,
          true,
        );
      }

      return {
        kind: 'image',
        buffer: Buffer.from(await response.arrayBuffer()),
        model: MODEL_VERSION,
        metadata: {
          provider: 'photoroom',
          modelVersion: 'photoroom-image-editing-v1',
          api: 'image-editing',
          shadowApplied: Boolean(params.shadow?.enabled),
          qualityMeasured: false,
        },
      };
    },
  };
}
