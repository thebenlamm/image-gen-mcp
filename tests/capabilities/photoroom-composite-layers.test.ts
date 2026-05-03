import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPhotoroomCompositeLayersCapability } from '../../src/capabilities/photoroom-composite-layers.js';
import { validateCapabilityParams } from '../../src/capabilities/validation.js';

let tmpDir: string;
let originalKey: string | undefined;

beforeEach(async () => {
  originalKey = process.env.PHOTOROOM_API_KEY;
  process.env.PHOTOROOM_API_KEY = 'test-key';
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-gen-photoroom-composite-'));
});

afterEach(async () => {
  if (originalKey === undefined) delete process.env.PHOTOROOM_API_KEY;
  else process.env.PHOTOROOM_API_KEY = originalKey;
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

async function writePng(): Promise<string> {
  const filePath = path.join(tmpDir, 'input.png');
  await sharp({
    create: { width: 32, height: 32, channels: 4, background: 'white' },
  }).png().toFile(filePath);
  return filePath;
}

describe('photoroom composite_layers capability', () => {
  it('returns null when PHOTOROOM_API_KEY is absent', () => {
    delete process.env.PHOTOROOM_API_KEY;
    expect(createPhotoroomCompositeLayersCapability()).toBeNull();
  });

  it('throws CONSTRAINT_VIOLATION when canvas or layers are missing', async () => {
    const capability = createPhotoroomCompositeLayersCapability();
    if (!capability) throw new Error('expected capability');

    await expect(capability.invoke({ params: { canvas: { width: 10, height: 10 } } })).rejects.toMatchObject({
      code: 'CONSTRAINT_VIOLATION',
      retryable: false,
    });
    await expect(capability.invoke({ params: { layers: [] } })).rejects.toMatchObject({
      code: 'CONSTRAINT_VIOLATION',
      retryable: false,
    });
  });

  it('returns image output with shadow metadata on success', async () => {
    const input = await writePng();
    const output = Buffer.from('photoroom composite png');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength),
    });
    vi.stubGlobal('fetch', fetchMock);
    const capability = createPhotoroomCompositeLayersCapability();
    if (!capability) throw new Error('expected capability');

    const result = await capability.invoke({
      params: {
        canvas: { width: 100, height: 80 },
        layers: [{ input, x: 0, y: 0, anchor: 'top-left' }],
        shadow: { enabled: true },
        background: { color: '#ffffff' },
      },
    });

    expect(result.kind).toBe('image');
    if (result.kind !== 'image') throw new Error('expected image');
    expect(result.buffer).toEqual(output);
    expect(result.metadata).toMatchObject({
      provider: 'photoroom',
      modelVersion: 'photoroom-image-editing-v1',
      api: 'image-editing',
      shadowApplied: true,
      qualityMeasured: false,
    });
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ 'x-api-key': 'test-key' });
    const formArg = fetchMock.mock.calls[0][1].body as FormData;
    const formKeys = Array.from((formArg as any).keys?.() ?? []);
    expect(formKeys.some((key) => String(key).startsWith('imageGenMcp.'))).toBe(false);
  });

  it('maps HTTP non-OK responses to retryable PROVIDER_FAILURE', async () => {
    const input = await writePng();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'provider down',
    }));
    const capability = createPhotoroomCompositeLayersCapability();
    if (!capability) throw new Error('expected capability');

    const error = await capability.invoke({
      params: { canvas: { width: 32, height: 32 }, layers: [{ input }] },
    }).catch((e) => e);
    expect(error).toMatchObject({
      code: 'PROVIDER_FAILURE',
      retryable: true,
      message: 'provider down',
    });
    expect(error.message).not.toContain('test-key');
  });

  it('maps AbortError to retryable TIMEOUT', async () => {
    const input = await writePng();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), {
      name: 'AbortError',
    })));
    const capability = createPhotoroomCompositeLayersCapability();
    if (!capability) throw new Error('expected capability');

    await expect(capability.invoke({
      params: { canvas: { width: 32, height: 32 }, layers: [{ input }] },
    })).rejects.toMatchObject({
      code: 'TIMEOUT',
      retryable: true,
    });
  });

  it('rejects multi-layer composite_layers:photoroom calls before the network call (single-subject contract)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const a = await writePng();
    const b = await writePng();
    const capability = createPhotoroomCompositeLayersCapability();
    if (!capability) throw new Error('expected capability');

    await expect(capability.invoke({
      params: {
        canvas: { width: 64, height: 64 },
        layers: [{ input: a }, { input: b }],
      },
    })).rejects.toMatchObject({
      code: 'CONSTRAINT_VIOLATION',
      retryable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exposes the documented composite_layers:photoroom contract through validateCapabilityParams', () => {
    const capability = createPhotoroomCompositeLayersCapability();
    if (!capability) throw new Error('expected capability');
    expect(capability.constraints.requiresInputImage).toBe(false);
    expect(capability.constraints.supportsMultipleInputs).toBe(false);
    expect(() => validateCapabilityParams(capability, {
      canvas: { width: 100, height: 80 },
      layers: [{ input: '/tmp/whatever.png' }],
    })).not.toThrow();
  });
});
