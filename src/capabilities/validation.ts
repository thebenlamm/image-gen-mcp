import type { Capability } from './types.js';

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
    if (!canvas || typeof canvas.width !== 'number' || typeof canvas.height !== 'number') {
      throw new Error('composite_layers requires canvas.width and canvas.height (numbers)');
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
    if (layers.length > 16) {
      throw new Error(`composite_layers layers exceed cap of 16 (got ${layers.length})`);
    }
    for (let index = 0; index < layers.length; index += 1) {
      const layer = layers[index] as Record<string, unknown>;
      if (typeof layer.input !== 'string' || layer.input.trim() === '') {
        throw new Error(`composite_layers.layers[${index}].input must be a non-empty string`);
      }
    }
  }

  if (capability.op === 'enhance_upscale') {
    const scale = params.scale ?? 2;
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
