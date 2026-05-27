import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditPromptCapability } from '../../src/capabilities/edit-prompt.js';

function okJsonResponse(b64: string) {
  return {
    ok: true,
    text: async () => JSON.stringify({
      data: [{ b64_json: b64, revised_prompt: 'done' }],
    }),
  } as unknown as Response;
}

async function smallPng(): Promise<string> {
  return (
    await sharp({
      create: { width: 8, height: 8, channels: 4, background: 'white' },
    }).png().toBuffer()
  ).toString('base64');
}

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

    await expect(capability.invoke({
      params: { input, prompt: 'make it white', max_retries: 0 },
    })).rejects.toMatchObject({
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

    await expect(capability.invoke({
      params: { input, prompt: 'make it white', max_retries: 0 },
    })).rejects.toMatchObject({
      code: 'PROVIDER_FAILURE',
      message: expect.stringContaining('bad gateway'),
    });
  });
});

describe('edit_prompt capability — error surfacing (fix #1)', () => {
  it('surfaces underlying fetch error class and cause code in the message', async () => {
    const input = await writeJpeg();
    const causeErr = Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' });
    const networkErr = Object.assign(new TypeError('fetch failed'), { cause: causeErr });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkErr));
    const capability = createEditPromptCapability();
    if (!capability) throw new Error('expected capability');

    await expect(
      capability.invoke({ params: { input, prompt: 'make it white', max_retries: 0 } }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_FAILURE',
      retryable: true,
      message: expect.stringMatching(/fetch failed/),
    });
    await expect(
      capability.invoke({ params: { input, prompt: 'make it white', max_retries: 0 } }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/UND_ERR_SOCKET/),
    });
  });

  it('surfaces the underlying error class name when no cause is present', async () => {
    const input = await writeJpeg();
    const networkErr = Object.assign(new TypeError('fetch failed'), { code: 'ECONNRESET' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkErr));
    const capability = createEditPromptCapability();
    if (!capability) throw new Error('expected capability');

    await expect(
      capability.invoke({ params: { input, prompt: 'make it white', max_retries: 0 } }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_FAILURE',
      message: expect.stringMatching(/ECONNRESET/),
    });
  });

  it('attaches the original error as cause on the CapabilityInvokeError', async () => {
    const input = await writeJpeg();
    const causeErr = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    const networkErr = Object.assign(new TypeError('fetch failed'), { cause: causeErr });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkErr));
    const capability = createEditPromptCapability();
    if (!capability) throw new Error('expected capability');

    try {
      await capability.invoke({ params: { input, prompt: 'make it white', max_retries: 0 } });
      throw new Error('expected error');
    } catch (err) {
      expect((err as Error & { cause?: unknown }).cause).toBe(networkErr);
    }
  });
});

describe('edit_prompt capability — retries (fix #2)', () => {
  it('retries transient network errors and succeeds on retry', async () => {
    const input = await writeJpeg();
    const png = await smallPng();
    const networkErr = Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
    });
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(networkErr)
      .mockResolvedValueOnce(okJsonResponse(png));
    vi.stubGlobal('fetch', fetchMock);
    const capability = createEditPromptCapability();
    if (!capability) throw new Error('expected capability');

    const result = await capability.invoke({
      params: { input, prompt: 'p', retry_initial_delay_ms: 1 },
    });
    expect(result.kind).toBe('image');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries 5xx responses', async () => {
    const input = await writeJpeg();
    const png = await smallPng();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'unavailable' } as unknown as Response)
      .mockResolvedValueOnce(okJsonResponse(png));
    vi.stubGlobal('fetch', fetchMock);
    const capability = createEditPromptCapability();
    if (!capability) throw new Error('expected capability');

    const result = await capability.invoke({
      params: { input, prompt: 'p', retry_initial_delay_ms: 1 },
    });
    expect(result.kind).toBe('image');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries 429 responses', async () => {
    const input = await writeJpeg();
    const png = await smallPng();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate limit' } as unknown as Response)
      .mockResolvedValueOnce(okJsonResponse(png));
    vi.stubGlobal('fetch', fetchMock);
    const capability = createEditPromptCapability();
    if (!capability) throw new Error('expected capability');

    const result = await capability.invoke({
      params: { input, prompt: 'p', retry_initial_delay_ms: 1 },
    });
    expect(result.kind).toBe('image');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on 400 (caller error)', async () => {
    const input = await writeJpeg();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { message: 'bad request' } }),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    const capability = createEditPromptCapability();
    if (!capability) throw new Error('expected capability');

    await expect(
      capability.invoke({ params: { input, prompt: 'p', retry_initial_delay_ms: 1 } }),
    ).rejects.toMatchObject({ code: 'PROVIDER_FAILURE' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('exhausts retries after max_retries+1 total attempts and surfaces final error', async () => {
    const input = await writeJpeg();
    const networkErr = Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
    });
    const fetchMock = vi.fn().mockRejectedValue(networkErr);
    vi.stubGlobal('fetch', fetchMock);
    const capability = createEditPromptCapability();
    if (!capability) throw new Error('expected capability');

    await expect(
      capability.invoke({ params: { input, prompt: 'p', max_retries: 2, retry_initial_delay_ms: 1 } }),
    ).rejects.toMatchObject({ code: 'PROVIDER_FAILURE', retryable: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('wraps mid-body terminate (response.text() throw) as PROVIDER_FAILURE retryable', async () => {
    const input = await writeJpeg();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => { throw new TypeError('terminated'); },
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    const capability = createEditPromptCapability();
    if (!capability) throw new Error('expected capability');

    await expect(
      capability.invoke({ params: { input, prompt: 'p', max_retries: 0 } }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_FAILURE',
      retryable: true,
      message: expect.stringContaining('terminated'),
    });
  });

  it('retries on mid-body terminate (response.text() throw)', async () => {
    const input = await writeJpeg();
    const png = await smallPng();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => { throw new TypeError('terminated'); },
      } as unknown as Response)
      .mockResolvedValueOnce(okJsonResponse(png));
    vi.stubGlobal('fetch', fetchMock);
    const capability = createEditPromptCapability();
    if (!capability) throw new Error('expected capability');

    const result = await capability.invoke({
      params: { input, prompt: 'p', retry_initial_delay_ms: 1 },
    });
    expect(result.kind).toBe('image');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry empty data[] from OpenAI (likely content-policy block)', async () => {
    const input = await writeJpeg();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ data: [] }),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    const capability = createEditPromptCapability();
    if (!capability) throw new Error('expected capability');

    await expect(
      capability.invoke({ params: { input, prompt: 'p', retry_initial_delay_ms: 1 } }),
    ).rejects.toMatchObject({ code: 'PROVIDER_FAILURE', retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry data[0] missing b64_json (malformed response)', async () => {
    const input = await writeJpeg();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ data: [{ revised_prompt: 'x' }] }),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    const capability = createEditPromptCapability();
    if (!capability) throw new Error('expected capability');

    await expect(
      capability.invoke({ params: { input, prompt: 'p', retry_initial_delay_ms: 1 } }),
    ).rejects.toMatchObject({ code: 'PROVIDER_FAILURE', retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry CONSTRAINT_VIOLATION (caller-side bad input)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const capability = createEditPromptCapability();
    if (!capability) throw new Error('expected capability');

    await expect(
      capability.invoke({ params: { input: '', prompt: 'p' } }),
    ).rejects.toMatchObject({ code: 'CONSTRAINT_VIOLATION' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries timeouts (AbortError)', async () => {
    const input = await writeJpeg();
    const png = await smallPng();
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      .mockResolvedValueOnce(okJsonResponse(png));
    vi.stubGlobal('fetch', fetchMock);
    const capability = createEditPromptCapability();
    if (!capability) throw new Error('expected capability');

    const result = await capability.invoke({
      params: { input, prompt: 'p', timeout_ms: 5000, retry_initial_delay_ms: 1 },
    });
    expect(result.kind).toBe('image');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('edit_prompt capability — configurable timeout (fix #3)', () => {
  it('uses 90s as default timeout (not 30s)', async () => {
    const input = await writeJpeg();
    const png = await smallPng();
    const observedTimeouts: number[] = [];

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJsonResponse(png)));
    const realSetTimeout = global.setTimeout;
    const spy = vi.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
      if (ms && ms >= 1000) observedTimeouts.push(ms);
      return realSetTimeout(fn, ms);
    }) as typeof setTimeout);

    const capability = createEditPromptCapability();
    if (!capability) throw new Error('expected capability');

    await capability.invoke({ params: { input, prompt: 'p' } });

    expect(observedTimeouts).toContain(90_000);
    expect(observedTimeouts).not.toContain(30_000);
    spy.mockRestore();
  });

  it('accepts params.timeout_ms override', async () => {
    const input = await writeJpeg();
    const png = await smallPng();
    const observedTimeouts: number[] = [];

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJsonResponse(png)));
    const realSetTimeout = global.setTimeout;
    const spy = vi.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
      if (ms && ms >= 1000) observedTimeouts.push(ms);
      return realSetTimeout(fn, ms);
    }) as typeof setTimeout);

    const capability = createEditPromptCapability();
    if (!capability) throw new Error('expected capability');

    await capability.invoke({ params: { input, prompt: 'p', timeout_ms: 5000 } });

    expect(observedTimeouts).toContain(5000);
    expect(observedTimeouts).not.toContain(90_000);
    spy.mockRestore();
  });

  it('rejects invalid timeout_ms with CONSTRAINT_VIOLATION', async () => {
    const input = await writeJpeg();
    vi.stubGlobal('fetch', vi.fn());
    const capability = createEditPromptCapability();
    if (!capability) throw new Error('expected capability');

    await expect(
      capability.invoke({ params: { input, prompt: 'p', timeout_ms: -1 } }),
    ).rejects.toMatchObject({ code: 'CONSTRAINT_VIOLATION' });
    await expect(
      capability.invoke({ params: { input, prompt: 'p', timeout_ms: 'fast' } }),
    ).rejects.toMatchObject({ code: 'CONSTRAINT_VIOLATION' });
  });
});
