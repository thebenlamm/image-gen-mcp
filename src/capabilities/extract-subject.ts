import { removeBackground } from '@imgly/background-removal-node';
import type { Capability } from './types.js';
import { CapabilityInvokeError } from './types.js';

const MODEL_VERSION = '@imgly/background-removal-node@1';

async function toBuffer(result: Blob | ArrayBuffer | Buffer): Promise<Buffer> {
  if (Buffer.isBuffer(result)) {
    return result;
  }

  if (result instanceof ArrayBuffer) {
    return Buffer.from(result);
  }

  return Buffer.from(await result.arrayBuffer());
}

export function createExtractSubjectCapability(): Capability {
  return {
    op: 'extract_subject',
    provider: '@imgly/local',
    modelVersion: MODEL_VERSION,
    constraints: {
      requiresInputImage: true,
      supportsMultipleInputs: false,
      outputFormat: 'png',
    },
    cost: { perCallUsd: 0 },
    latencyMsP50: 2500,
    async invoke(input) {
      const filePath = input.params.input;

      if (typeof filePath !== 'string' || !filePath.trim()) {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'extract_subject requires params.input file path', false);
      }

      const result = await removeBackground(filePath);
      const buffer = await toBuffer(result);

      return {
        kind: 'image',
        buffer,
        model: MODEL_VERSION,
        metadata: { input: filePath },
      };
    },
  };
}
