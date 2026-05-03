import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPhotoroomExtractSubjectCapability } from '../../src/capabilities/photoroom-extract-subject.js';

let tmpDir: string;
let originalKey: string | undefined;

beforeEach(async () => {
  originalKey = process.env.PHOTOROOM_API_KEY;
  process.env.PHOTOROOM_API_KEY = 'test-key';
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-gen-photoroom-extract-'));
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

describe('photoroom extract_subject capability', () => {
  it('returns null when PHOTOROOM_API_KEY is absent', () => {
    delete process.env.PHOTOROOM_API_KEY;
    expect(createPhotoroomExtractSubjectCapability()).toBeNull();
  });

  it('throws CONSTRAINT_VIOLATION when input is missing', async () => {
    const capability = createPhotoroomExtractSubjectCapability();
    if (!capability) throw new Error('expected capability');

    await expect(capability.invoke({ params: {} })).rejects.toMatchObject({
      code: 'CONSTRAINT_VIOLATION',
      retryable: false,
    });
  });

  it('returns image output with Photoroom metadata on success', async () => {
    const input = await writePng();
    const output = Buffer.from('photoroom png');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength),
    });
    vi.stubGlobal('fetch', fetchMock);
    const capability = createPhotoroomExtractSubjectCapability();
    if (!capability) throw new Error('expected capability');

    const result = await capability.invoke({ params: { input } });

    expect(result.kind).toBe('image');
    if (result.kind !== 'image') throw new Error('expected image');
    expect(result.buffer).toEqual(output);
    expect(result.metadata).toMatchObject({
      provider: 'photoroom',
      modelVersion: 'photoroom-remove-bg-v2',
      api: 'remove-background',
      qualityMeasured: false,
    });
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ 'x-api-key': 'test-key' });
  });

  it('maps HTTP non-OK responses to retryable PROVIDER_FAILURE', async () => {
    const input = await writePng();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => 'bad gateway',
    }));
    const capability = createPhotoroomExtractSubjectCapability();
    if (!capability) throw new Error('expected capability');

    await expect(capability.invoke({ params: { input } })).rejects.toMatchObject({
      code: 'PROVIDER_FAILURE',
      retryable: true,
      message: 'bad gateway',
    });
  });

  it('maps AbortError to retryable TIMEOUT', async () => {
    const input = await writePng();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), {
      name: 'AbortError',
    })));
    const capability = createPhotoroomExtractSubjectCapability();
    if (!capability) throw new Error('expected capability');

    await expect(capability.invoke({ params: { input } })).rejects.toMatchObject({
      code: 'TIMEOUT',
      retryable: true,
    });
  });
});
