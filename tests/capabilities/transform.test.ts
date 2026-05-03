import * as path from 'path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { CapabilityInvokeError } from '../../src/capabilities/types.js';
import { createTransformCapability } from '../../src/capabilities/transform.js';

const INPUT = path.resolve('eval/fixtures/dims-256x128.png');

describe('transform capability', () => {
  it('applies processing operations through sharp', async () => {
    const capability = createTransformCapability();

    const result = await capability.invoke({
      params: {
        input: INPUT,
        operations: [{ type: 'resize', width: 64, height: 64, fit: 'cover' }],
      },
    });

    expect(result.kind).toBe('image');
    if (result.kind !== 'image') throw new Error('expected image result');
    const meta = await sharp(result.buffer).metadata();
    expect(meta.width).toBe(64);
    expect(meta.height).toBe(64);
    expect(result.model).toBe('sharp-transform@1');
    expect(result.metadata?.operationsApplied).toEqual(['resize(64x64, cover)']);
    expect(result.metadata).toHaveProperty('originalInfo');
    expect(result.metadata).toHaveProperty('outputInfo');
  });

  it('rejects operation chains longer than maxOps=16', async () => {
    const capability = createTransformCapability();

    await expect(capability.invoke({
      params: {
        input: INPUT,
        operations: Array.from({ length: 17 }, () => ({ type: 'circleMask' })),
      },
    })).rejects.toMatchObject({
      code: 'CONSTRAINT_VIOLATION',
      retryable: false,
    });
    await expect(capability.invoke({
      params: {
        input: INPUT,
        operations: Array.from({ length: 17 }, () => ({ type: 'circleMask' })),
      },
    })).rejects.toThrow(/maxOps=16/);
  });

  it('rejects missing input with CapabilityInvokeError', async () => {
    const capability = createTransformCapability();

    await expect(capability.invoke({ params: { operations: [] } })).rejects.toBeInstanceOf(
      CapabilityInvokeError,
    );
  });
});
