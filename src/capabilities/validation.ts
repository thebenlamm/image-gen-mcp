import type { Capability } from './types.js';

const COMPOSITE_ANCHORS = new Set(['top-left', 'center', 'top-right', 'bottom-left', 'bottom-right']);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateCapabilityParams(
  capability: Capability,
  params: Record<string, unknown>
): void {
  if (capability.constraints.requiresInputImage === true) {
    if (typeof params.input !== 'string' || params.input.trim().length === 0) {
      throw new Error(`${capability.op} requires params.input file path`);
    }
  }

  if (capability.op === 'edit_prompt') {
    if (typeof params.prompt !== 'string' || params.prompt.trim().length === 0) {
      throw new Error('edit_prompt requires params.prompt');
    }
  }

  if (capability.op === 'generate') {
    if (typeof params.prompt !== 'string' || params.prompt.trim().length === 0) {
      throw new Error('generate requires params.prompt');
    }
  }

  if (capability.op === 'transform') {
    const ops = params.operations;
    if (!Array.isArray(ops)) {
      throw new Error('transform requires params.operations array');
    }
    if (ops.length > 16) {
      throw new Error(`transform operations chain exceeds maxOps=16 (got ${ops.length})`);
    }
  }

  if (capability.op === 'analyze_palette') {
    const c = params.count;
    if (c !== undefined && (typeof c !== 'number' || !Number.isInteger(c) || c < 1 || c > 16)) {
      throw new Error('analyze_palette count must be an integer 1-16');
    }
  }

  if (capability.op === 'composite_layers') {
    const canvas = params.canvas as Record<string, unknown> | undefined;
    if (!canvas || !isFiniteNumber(canvas.width) || !isFiniteNumber(canvas.height)) {
      throw new Error('composite_layers requires canvas.width and canvas.height (numbers)');
    }
    if (!Number.isInteger(canvas.width) || !Number.isInteger(canvas.height)) {
      throw new Error('composite_layers canvas dimensions must be integer pixels');
    }
    if (canvas.width <= 0 || canvas.height <= 0) {
      throw new Error('composite_layers canvas dimensions must be positive');
    }
    if (canvas.width * canvas.height > 16_000_000) {
      throw new Error(`composite_layers canvas exceeds 16MP cap (got ${(canvas.width * canvas.height) / 1e6}MP)`);
    }
    const layers = params.layers;
    if (!Array.isArray(layers) || layers.length === 0) {
      throw new Error('composite_layers requires non-empty layers array');
    }
    if (capability.constraints.supportsMultipleInputs === false && layers.length !== 1) {
      throw new Error(`composite_layers provider supports exactly one layer (got ${layers.length})`);
    }
    if (capability.constraints.supportsMultipleInputs === false) {
      const layer = layers[0];
      if (!isRecord(layer)) {
        throw new Error('composite_layers.layers[0] must be an object');
      }
      const placementFields = ['x', 'y', 'scale', 'opacity', 'anchor'].filter((field) => layer[field] !== undefined);
      if (placementFields.length > 0) {
        throw new Error(
          `composite_layers provider does not support layer placement fields: ${placementFields.join(', ')}`
        );
      }
    }
    if (layers.length > 16) {
      throw new Error(`composite_layers layers exceed cap of 16 (got ${layers.length})`);
    }
    for (let index = 0; index < layers.length; index += 1) {
      const layer = layers[index];
      if (!isRecord(layer)) {
        throw new Error(`composite_layers.layers[${index}] must be an object`);
      }
      if (typeof layer.input !== 'string' || layer.input.trim() === '') {
        throw new Error(`composite_layers.layers[${index}].input must be a non-empty string`);
      }
      if (layer.x !== undefined && !isFiniteNumber(layer.x)) {
        throw new Error(`composite_layers.layers[${index}].x must be a finite number`);
      }
      if (layer.y !== undefined && !isFiniteNumber(layer.y)) {
        throw new Error(`composite_layers.layers[${index}].y must be a finite number`);
      }
      if (layer.scale !== undefined && (!isFiniteNumber(layer.scale) || layer.scale < 0.05 || layer.scale > 10)) {
        throw new Error(`composite_layers.layers[${index}].scale must be between 0.05 and 10`);
      }
      if (layer.opacity !== undefined && (!isFiniteNumber(layer.opacity) || layer.opacity < 0 || layer.opacity > 1)) {
        throw new Error(`composite_layers.layers[${index}].opacity must be between 0 and 1`);
      }
      if (layer.anchor !== undefined && (typeof layer.anchor !== 'string' || !COMPOSITE_ANCHORS.has(layer.anchor))) {
        throw new Error(`composite_layers.layers[${index}].anchor is invalid`);
      }
    }
  }

  if (capability.op === 'enhance_upscale') {
    const scale = params.scale === undefined ? 2 : params.scale;
    if (typeof scale !== 'number' || (scale !== 2 && scale !== 4)) {
      throw new Error('enhance_upscale scale must be 2 or 4');
    }
    if (params.face_enhance !== undefined && typeof params.face_enhance !== 'boolean') {
      throw new Error('enhance_upscale face_enhance must be boolean');
    }
  }

  if (
    capability.constraints.maxPromptLength !== undefined &&
    typeof params.prompt === 'string' &&
    params.prompt.length > capability.constraints.maxPromptLength
  ) {
    throw new Error(
      `${capability.op} prompt exceeds max length ${capability.constraints.maxPromptLength}`
    );
  }

  if (
    capability.constraints.supportedSizes !== undefined &&
    params.size !== undefined &&
    !capability.constraints.supportedSizes.includes(
      params.size as 'square' | 'landscape' | 'portrait'
    )
  ) {
    throw new Error(`${capability.op} does not support size '${params.size}'`);
  }
}
