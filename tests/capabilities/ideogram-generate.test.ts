import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIdeogramGenerateCapability } from '../../src/capabilities/ideogram-generate.js';

let originalKey: string | undefined;

beforeEach(() => {
  originalKey = process.env.IDEOGRAM_API_KEY;
  process.env.IDEOGRAM_API_KEY = 'test-key';
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.IDEOGRAM_API_KEY;
  else process.env.IDEOGRAM_API_KEY = originalKey;
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('ideogram generate capability', () => {
  it('returns null when IDEOGRAM_API_KEY is absent', () => {
    delete process.env.IDEOGRAM_API_KEY;
    expect(createIdeogramGenerateCapability()).toBeNull();
  });

  it('throws CONSTRAINT_VIOLATION when prompt is missing or empty', async () => {
    const capability = createIdeogramGenerateCapability();
    if (!capability) throw new Error('expected capability');

    await expect(capability.invoke({ params: {} })).rejects.toMatchObject({
      code: 'CONSTRAINT_VIOLATION',
      retryable: false,
    });
    await expect(capability.invoke({ params: { prompt: '   ' } })).rejects.toMatchObject({
      code: 'CONSTRAINT_VIOLATION',
      retryable: false,
    });
  });

  it('throws CONSTRAINT_VIOLATION when prompt exceeds 4000 characters', async () => {
    const capability = createIdeogramGenerateCapability();
    if (!capability) throw new Error('expected capability');

    await expect(capability.invoke({ params: { prompt: 'x'.repeat(4001) } })).rejects.toMatchObject({
      code: 'CONSTRAINT_VIOLATION',
      retryable: false,
    });
  });

  it('generates and downloads the ephemeral image URL', async () => {
    const output = Buffer.from('ideogram png');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ url: 'https://ideogram/image.png', seed: 42 }] }))
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength),
      });
    vi.stubGlobal('fetch', fetchMock);
    const capability = createIdeogramGenerateCapability();
    if (!capability) throw new Error('expected capability');

    const result = await capability.invoke({ params: { prompt: 'A sign that says HELLO', size: 'landscape' } });

    expect(result.kind).toBe('image');
    if (result.kind !== 'image') throw new Error('expected image');
    expect(result.buffer).toEqual(output);
    expect(result.metadata).toMatchObject({
      provider: 'ideogram',
      modelVersion: 'ideogram-v3-0',
      seed: 42,
      qualityMeasured: false,
    });
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ 'Api-Key': 'test-key' });
    expect((fetchMock.mock.calls[0][1].body as FormData).get('aspect_ratio')).toBe('16x9');
  });

  it('maps HTTP non-OK generate responses to PROVIDER_FAILURE', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'bad prompt' } }, false, 400)));
    const capability = createIdeogramGenerateCapability();
    if (!capability) throw new Error('expected capability');

    await expect(capability.invoke({ params: { prompt: 'A sign' } })).rejects.toMatchObject({
      code: 'PROVIDER_FAILURE',
      retryable: true,
      message: 'bad prompt',
    });
  });

  it('maps AbortError on initial generate request to retryable TIMEOUT', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    const capability = createIdeogramGenerateCapability();
    if (!capability) throw new Error('expected capability');

    await expect(capability.invoke({ params: { prompt: 'A sign' } })).rejects.toMatchObject({
      code: 'TIMEOUT',
      retryable: true,
      message: 'Ideogram generate timed out after 30s',
    });
  });

  it('maps AbortError on image download to retryable TIMEOUT', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ url: 'https://ideogram/image.png', seed: 42 }] }))
      .mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    vi.stubGlobal('fetch', fetchMock);
    const capability = createIdeogramGenerateCapability();
    if (!capability) throw new Error('expected capability');

    await expect(capability.invoke({ params: { prompt: 'A sign' } })).rejects.toMatchObject({
      code: 'TIMEOUT',
      retryable: true,
    });
  });
});
