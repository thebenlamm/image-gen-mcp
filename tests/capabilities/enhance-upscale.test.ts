import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEnhanceUpscaleCapability } from '../../src/capabilities/enhance-upscale.js';
import { CapabilityRegistry } from '../../src/capabilities/registry.js';
import { CapabilityInvokeError } from '../../src/capabilities/types.js';

const createMock = vi.fn();
const waitMock = vi.fn();
const cancelMock = vi.fn();

vi.mock('replicate', () => ({
  default: vi.fn().mockImplementation(() => ({
    predictions: { create: createMock, cancel: cancelMock },
    wait: waitMock,
  })),
}));

let tmpDir: string;
let originalToken: string | undefined;

async function writePng(name: string, width: number, height: number): Promise<string> {
  const filePath = path.join(tmpDir, name);
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 20, g: 40, b: 60, alpha: 1 },
    },
  }).png().toFile(filePath);
  return filePath;
}

function setToken(value: string | undefined): void {
  if (value === undefined) {
    delete process.env.REPLICATE_API_TOKEN;
  } else {
    process.env.REPLICATE_API_TOKEN = value;
  }
}

beforeEach(async () => {
  originalToken = process.env.REPLICATE_API_TOKEN;
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-gen-upscale-'));
  vi.clearAllMocks();
  createMock.mockReset();
  cancelMock.mockReset();
  waitMock.mockReset();
});

afterEach(async () => {
  setToken(originalToken);
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('enhance_upscale capability', () => {
  it('returns null without a usable Replicate token', () => {
    setToken(undefined);
    expect(createEnhanceUpscaleCapability()).toBeNull();

    setToken('${REPLICATE_API_TOKEN}');
    expect(createEnhanceUpscaleCapability()).toBeNull();
  });

  it('registers with an unscored justification', () => {
    setToken('test-token');
    const capability = createEnhanceUpscaleCapability();
    if (!capability) throw new Error('expected capability');

    expect(capability.quality?.unscoredJustification).toContain('No deterministic scorer');
    const registry = new CapabilityRegistry();
    expect(() => registry.register(capability, { allowUnscoredProduction: true })).not.toThrow();
  });

  it('rejects oversized inputs before calling Replicate', async () => {
    setToken('test-token');
    const capability = createEnhanceUpscaleCapability();
    if (!capability) throw new Error('expected capability');
    const input = await writePng('large.png', 2050, 2050);

    await expect(capability.invoke({ params: { input } })).rejects.toMatchObject({
      code: 'INPUT_TOO_LARGE',
      retryable: false,
    });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('rejects output megapixels over the cap before calling Replicate', async () => {
    setToken('test-token');
    const capability = createEnhanceUpscaleCapability();
    if (!capability) throw new Error('expected capability');
    const input = await writePng('output-too-large.png', 1500, 1500);

    await expect(capability.invoke({ params: { input, scale: 4 } })).rejects.toMatchObject({
      code: 'INPUT_TOO_LARGE',
      retryable: false,
    });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('rejects unsupported scale values', async () => {
    setToken('test-token');
    const capability = createEnhanceUpscaleCapability();
    if (!capability) throw new Error('expected capability');
    const input = await writePng('input.png', 256, 256);

    await expect(capability.invoke({ params: { input, scale: 3 } })).rejects.toBeInstanceOf(
      CapabilityInvokeError,
    );
    await expect(capability.invoke({ params: { input, scale: 3 } })).rejects.toMatchObject({
      code: 'CONSTRAINT_VIOLATION',
    });
    await expect(capability.invoke({ params: { input, scale: null } })).rejects.toMatchObject({
      code: 'CONSTRAINT_VIOLATION',
    });
  });

  it('returns a fetched upscaled image with prediction metadata', async () => {
    setToken('test-token');
    const capability = createEnhanceUpscaleCapability();
    if (!capability) throw new Error('expected capability');
    const input = await writePng('input.png', 256, 256);
    const outputBuffer = await sharp({
      create: { width: 512, height: 512, channels: 4, background: 'white' },
    }).png().toBuffer();
    createMock.mockResolvedValue({ id: 'pred-abc' });
    waitMock.mockResolvedValue({ id: 'pred-abc', status: 'succeeded', output: 'https://r.io/x.png' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => outputBuffer.buffer.slice(
        outputBuffer.byteOffset,
        outputBuffer.byteOffset + outputBuffer.byteLength,
      ),
    }));

    const result = await capability.invoke({ params: { input, scale: 2 } });

    expect(result.kind).toBe('image');
    if (result.kind !== 'image') throw new Error('expected image result');
    expect(result.model).toBe('nightmareai/real-esrgan@latest');
    expect(result.metadata).toMatchObject({
      predictionId: 'pred-abc',
      scale: 2,
      face_enhance: false,
      inputMP: 0.065536,
      outputMP: 0.262144,
    });
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      model: 'nightmareai/real-esrgan',
      input: expect.objectContaining({ scale: 2, face_enhance: false }),
    }));
  });

  it('retries URL fetch once and then surfaces timeout failures', async () => {
    setToken('test-token');
    const capability = createEnhanceUpscaleCapability();
    if (!capability) throw new Error('expected capability');
    const input = await writePng('input.png', 256, 256);
    const outputBuffer = await sharp({
      create: { width: 512, height: 512, channels: 4, background: 'white' },
    }).png().toBuffer();
    createMock.mockResolvedValue({ id: 'pred-abc' });
    waitMock.mockResolvedValue({ id: 'pred-abc', status: 'succeeded', output: 'https://r.io/x.png' });

    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => outputBuffer.buffer.slice(
          outputBuffer.byteOffset,
          outputBuffer.byteOffset + outputBuffer.byteLength,
        ),
      });
    vi.stubGlobal('fetch', fetchMock);
    await expect(capability.invoke({ params: { input } })).resolves.toMatchObject({ kind: 'image' });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new Error('network'));
    await expect(capability.invoke({ params: { input } })).rejects.toMatchObject({
      code: 'TIMEOUT',
      retryable: true,
    });
  });

  it('cancels the prediction and throws TIMEOUT when wait() stops before success', async () => {
    setToken('test-token');
    const capability = createEnhanceUpscaleCapability();
    if (!capability) throw new Error('expected capability');
    const input = await writePng('input.png', 256, 256);
    createMock.mockResolvedValue({ id: 'pred-slow' });
    waitMock.mockResolvedValue({ id: 'pred-slow', status: 'processing' });
    cancelMock.mockResolvedValue({ id: 'pred-slow', status: 'canceled' });

    await expect(capability.invoke({ params: { input } })).rejects.toMatchObject({
      code: 'TIMEOUT',
      retryable: false,
    });
    expect(cancelMock).toHaveBeenCalledWith('pred-slow');
    // wait() must receive a stop callback so polling is bounded
    expect(typeof waitMock.mock.calls[0][2]).toBe('function');
  });

  it('keeps a result that succeeded in the cancel race window', async () => {
    setToken('test-token');
    const capability = createEnhanceUpscaleCapability();
    if (!capability) throw new Error('expected capability');
    const input = await writePng('input.png', 256, 256);
    const outputBuffer = await sharp({
      create: { width: 512, height: 512, channels: 4, background: 'white' },
    }).png().toBuffer();
    createMock.mockResolvedValue({ id: 'pred-race' });
    waitMock.mockResolvedValue({ id: 'pred-race', status: 'processing' });
    cancelMock.mockResolvedValue({ id: 'pred-race', status: 'succeeded', output: 'https://r.io/x.png' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => outputBuffer.buffer.slice(
        outputBuffer.byteOffset,
        outputBuffer.byteOffset + outputBuffer.byteLength,
      ),
    }));
    await expect(capability.invoke({ params: { input } })).resolves.toMatchObject({ kind: 'image' });
  });

  it('labels a failed prediction PROVIDER_FAILURE, not TIMEOUT, and does not cancel', async () => {
    setToken('test-token');
    const capability = createEnhanceUpscaleCapability();
    if (!capability) throw new Error('expected capability');
    const input = await writePng('input.png', 256, 256);
    createMock.mockResolvedValue({ id: 'pred-bad' });
    waitMock.mockResolvedValue({ id: 'pred-bad', status: 'failed', error: 'boom' });
    await expect(capability.invoke({ params: { input } })).rejects.toMatchObject({ code: 'PROVIDER_FAILURE' });
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it('uses cost per megapixel and defaults face enhancement off', () => {
    setToken('test-token');
    const capability = createEnhanceUpscaleCapability();
    if (!capability) throw new Error('expected capability');

    expect(capability.cost.perMegapixelUsd).toBeGreaterThan(0);
    expect(capability.cost.perCallUsd).toBeUndefined();
  });
});
