import * as fs from 'fs';
import { assertWithinInputRoot } from '../utils/path-input-root.js';
import { applyOperations } from '../utils/processing.js';
import type { Capability, ProcessingOperation } from './types.js';
import { CapabilityInvokeError } from './types.js';

const MODEL_VERSION = 'sharp-transform@1';
const MAX_OPS = 16;

export function createTransformCapability(): Capability {
  return {
    op: 'transform',
    provider: 'sharp',
    modelVersion: MODEL_VERSION,
    constraints: {
      requiresInputImage: true,
      supportsMultipleInputs: false,
      outputFormat: 'png',
    },
    cost: { perCallUsd: 0 },
    latencyMsP50: 200,
    async invoke(input) {
      const filePath = input.params.input;
      if (typeof filePath !== 'string' || !filePath.trim()) {
        throw new CapabilityInvokeError(
          'CONSTRAINT_VIOLATION',
          'transform requires params.input file path',
          false,
        );
      }
      try {
        await assertWithinInputRoot(filePath);
      } catch (error) {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', error instanceof Error ? error.message : String(error), false);
      }

      const operations = input.params.operations;
      if (!Array.isArray(operations)) {
        throw new CapabilityInvokeError(
          'CONSTRAINT_VIOLATION',
          'transform requires params.operations array',
          false,
        );
      }

      if (operations.length > MAX_OPS) {
        throw new CapabilityInvokeError(
          'CONSTRAINT_VIOLATION',
          `transform operations chain exceeds maxOps=${MAX_OPS}`,
          false,
          'reduce the number of operations or split across multiple invocations',
        );
      }

      const buffer = await fs.promises.readFile(filePath);
      const result = await applyOperations(buffer, operations as ProcessingOperation[]);

      return {
        kind: 'image',
        buffer: result.buffer,
        model: MODEL_VERSION,
        metadata: {
          input: filePath,
          originalInfo: result.originalInfo,
          outputInfo: result.outputInfo,
          operationsApplied: result.operationsApplied,
        },
      };
    },
  };
}
