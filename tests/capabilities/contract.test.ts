import { describe, expect, it } from 'vitest';
import {
  CapabilityInvokeError,
  type CapabilityInvokeResult,
} from '../../src/capabilities/types.js';

function summarize(result: CapabilityInvokeResult): string {
  if (result.kind === 'data') {
    if (result.data.type === 'dimensions') {
      return `${result.data.width}x${result.data.height}`;
    }
    if (result.data.type === 'palette') {
      return `${result.data.colors.length} colors`;
    }
    return result.data.text;
  }

  return `${result.buffer.length}:${result.model}`;
}

describe('capability contract', () => {
  it('narrows image and data invoke results by discriminant', () => {
    const imageResult: CapabilityInvokeResult = {
      kind: 'image',
      buffer: Buffer.from('png'),
      model: 'sharp-test',
    };
    const dataResult: CapabilityInvokeResult = {
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
    };

    expect(summarize(imageResult)).toBe('3:sharp-test');
    expect(summarize(dataResult)).toBe('256x128');
  });

  it('exposes structured capability invoke errors', () => {
    const error = new CapabilityInvokeError(
      'INPUT_TOO_LARGE',
      'm',
      false,
      's',
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('INPUT_TOO_LARGE');
    expect(error.retryable).toBe(false);
    expect(error.suggestion).toBe('s');
    expect(error.name).toBe('CapabilityInvokeError');
  });
});
