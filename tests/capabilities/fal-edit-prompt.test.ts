import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFalEditPromptCapability } from '../../src/capabilities/fal-edit-prompt.js';

let tmpDir: string;
let originalKey: string | undefined;

beforeEach(async () => {
  originalKey = process.env.FAL_KEY;
  process.env.FAL_KEY = 'test-key';
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-gen-fal-'));
});

afterEach(async () => {
  if (originalKey === undefined) delete process.env.FAL_KEY;
  else process.env.FAL_KEY = originalKey;
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

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('fal edit_prompt capability', () => {
  it('returns null when FAL_KEY is absent', () => {
    delete process.env.FAL_KEY;
    expect(createFalEditPromptCapability()).toBeNull();
  });

  it('throws CONSTRAINT_VIOLATION when input or prompt is missing', async () => {
    const capability = createFalEditPromptCapability();
    if (!capability) throw new Error('expected capability');

    await expect(capability.invoke({ params: { prompt: 'edit' } })).rejects.toMatchObject({
      code: 'CONSTRAINT_VIOLATION',
      retryable: false,
    });
    await expect(capability.invoke({ params: { input: await writePng() } })).rejects.toMatchObject({
      code: 'CONSTRAINT_VIOLATION',
      retryable: false,
    });
  });

  it('submits through the queue and returns downloaded image metadata', async () => {
    const input = await writePng();
    const output = Buffer.from('fal png');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        request_id: 'req-123',
        status: 'IN_QUEUE',
        status_url: 'https://fal/status',
        response_url: 'https://fal/response',
      }))
      .mockResolvedValueOnce(jsonResponse({ status: 'COMPLETED' }))
      .mockResolvedValueOnce(jsonResponse({ images: [{ url: 'https://fal/image.png' }] }))
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength),
      });
    vi.stubGlobal('fetch', fetchMock);
    const capability = createFalEditPromptCapability();
    if (!capability) throw new Error('expected capability');

    const result = await capability.invoke({ params: { input, prompt: 'make it blue' } });

    expect(result.kind).toBe('image');
    if (result.kind !== 'image') throw new Error('expected image');
    expect(result.buffer).toEqual(output);
    expect(result.metadata).toMatchObject({
      provider: 'fal',
      modelVersion: 'fal-ai/flux-pro/kontext',
      requestId: 'req-123',
      qualityMeasured: false,
    });
    const submitBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(submitBody.image_url).toMatch(/^data:image\/png;base64,/);
    expect(submitBody.prompt).toBe('make it blue');
  });

  it('maps HTTP non-OK submit responses to retryable PROVIDER_FAILURE', async () => {
    const input = await writePng();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'bad' }, false, 502)));
    const capability = createFalEditPromptCapability();
    if (!capability) throw new Error('expected capability');

    await expect(capability.invoke({ params: { input, prompt: 'edit' } })).rejects.toMatchObject({
      code: 'PROVIDER_FAILURE',
      retryable: true,
    });
  });

  it('maps AbortError on image download to retryable TIMEOUT', async () => {
    const input = await writePng();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ images: [{ url: 'https://fal/image.png' }], request_id: 'req-123' }))
      .mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    vi.stubGlobal('fetch', fetchMock);
    const capability = createFalEditPromptCapability();
    if (!capability) throw new Error('expected capability');

    await expect(capability.invoke({ params: { input, prompt: 'edit' } })).rejects.toMatchObject({
      code: 'TIMEOUT',
      retryable: true,
    });
  });
});
