import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { CapabilityInvokeError } from '../../src/capabilities/types.js';
import { createAnalyzeDimensionsCapability } from '../../src/capabilities/analyze-dimensions.js';

const INPUT = path.resolve('eval/fixtures/dims-256x128.png');

describe('analyze_dimensions capability', () => {
  it('returns sharp metadata as a typed data result', async () => {
    const capability = createAnalyzeDimensionsCapability();

    const result = await capability.invoke({ params: { input: INPUT } });

    expect(result).toEqual({
      kind: 'data',
      data: {
        type: 'dimensions',
        width: 256,
        height: 128,
        format: 'png',
        channels: 4,
        hasAlpha: true,
      },
      model: 'sharp-metadata@1',
      metadata: { input: INPUT },
    });
  });

  it('rejects missing input with CapabilityInvokeError', async () => {
    const capability = createAnalyzeDimensionsCapability();

    await expect(capability.invoke({ params: {} })).rejects.toBeInstanceOf(
      CapabilityInvokeError,
    );
  });
});
