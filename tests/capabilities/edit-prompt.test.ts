import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditPromptCapability } from '../../src/capabilities/edit-prompt.js';

let tmpDir: string;
let originalKey: string | undefined;

beforeEach(async () => {
  originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-gen-edit-'));
});

afterEach(async () => {
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

async function writeJpeg(): Promise<string> {
  const filePath = path.join(tmpDir, 'input.jpg');
  await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 3,
      background: { r: 20, g: 40, b: 60 },
    },
  }).jpeg().toFile(filePath);
  return filePath;
}

describe('edit_prompt capability', () => {
  it('uses the decoded input MIME type in the data URL', async () => {
    const input = await writeJpeg();
    const output = await sharp({
      create: { width: 32, height: 32, channels: 4, background: 'white' },
    }).png().toBuffer();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        data: [{ b64_json: output.toString('base64'), revised_prompt: 'done' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const capability = createEditPromptCapability();
    if (!capability) throw new Error('expected capability');

    await capability.invoke({ params: { input, prompt: 'make it white' } });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.images[0].image_url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('turns provider timeouts into retryable CapabilityInvokeError values', async () => {
    const input = await writeJpeg();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), {
      name: 'AbortError',
    })));
    const capability = createEditPromptCapability();
    if (!capability) throw new Error('expected capability');

    await expect(capability.invoke({ params: { input, prompt: 'make it white' } })).rejects.toMatchObject({
      code: 'TIMEOUT',
      retryable: true,
    });
  });

  it('preserves HTTP status context for non-JSON provider errors', async () => {
    const input = await writeJpeg();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => 'bad gateway',
    }));
    const capability = createEditPromptCapability();
    if (!capability) throw new Error('expected capability');

    await expect(capability.invoke({ params: { input, prompt: 'make it white' } })).rejects.toMatchObject({
      code: 'PROVIDER_FAILURE',
      message: expect.stringContaining('bad gateway'),
    });
  });
});
