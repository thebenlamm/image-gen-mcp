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
