import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { withTmpOutputDir, type TmpOutputDir } from '../helpers/tmpOutputDir.js';
import { handleGenerateBatch } from '../../src/batch.js';

const FAKE_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex',
);

// Fake provider used across tests
const mockGenerate = vi.fn(async () => ({
  buffer: FAKE_PNG,
  model: 'test-model',
  revisedPrompt: undefined,
}));

// Mock provider-utils to return the fake provider without needing real API keys
vi.mock('../../src/provider-utils.js', () => ({
  resolveDefaultProvider: () => 'openai',
  buildEffectivePrompt: (prompt: string, style?: string) =>
    style ? `${style}, ${prompt}` : prompt,
  resolveProvider: (
    requested: string | undefined,
    _needsSize: boolean,
    _defaultProvider: string,
  ) => {
    const providerName = requested || 'openai';
    // Simulate missing provider
    if (providerName === 'nonexistent-provider') {
      return {
        error: `Provider '${providerName}' is not available. Available providers: openai`,
        providerName,
      };
    }
    return {
      provider: { generate: mockGenerate, supportsSize: false },
      providerName,
    };
  },
}));

function parseResponse(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text);
}

describe('generate_batch', () => {
  let tmp: TmpOutputDir;

  beforeEach(async () => {
    tmp = await withTmpOutputDir();
    mockGenerate.mockClear();
  });

  afterEach(async () => {
    await tmp.restore();
  });

  it('all items succeed → status success, summary.succeeded === 3', async () => {
    mockGenerate.mockResolvedValue({ buffer: FAKE_PNG, model: 'test-model' });

    const result = await handleGenerateBatch({
      items: [
        { prompt: 'a cat' },
        { prompt: 'a dog' },
        { prompt: 'a bird' },
      ],
      outputDir: tmp.dir,
    });

    const parsed = parseResponse(result);
    expect(parsed.status).toBe('success');
    expect(parsed.summary.total).toBe(3);
    expect(parsed.summary.succeeded).toBe(3);
    expect(parsed.summary.failed).toBe(0);
    expect(parsed.items).toHaveLength(3);
    for (const item of parsed.items) {
      expect(item.success).toBe(true);
      expect(typeof item.path).toBe('string');
    }
  });

  it('middle item throws → status partial, item[1].success false, others succeed', async () => {
    mockGenerate
      .mockResolvedValueOnce({ buffer: FAKE_PNG, model: 'test-model' })
      .mockRejectedValueOnce(new Error('upstream error'))
      .mockResolvedValueOnce({ buffer: FAKE_PNG, model: 'test-model' });

    const result = await handleGenerateBatch({
      items: [
        { prompt: 'a cat' },
        { prompt: 'a dog' },
        { prompt: 'a bird' },
      ],
      outputDir: tmp.dir,
    });

    const parsed = parseResponse(result);
    expect(parsed.status).toBe('partial');
    expect(parsed.summary.succeeded).toBe(2);
    expect(parsed.summary.failed).toBe(1);
    expect(parsed.items[0].success).toBe(true);
    expect(parsed.items[1].success).toBe(false);
    expect(typeof parsed.items[1].error).toBe('string');
    expect(parsed.items[1].error).toContain('upstream error');
    expect(parsed.items[2].success).toBe(true);
  });

  it('all items throw → status error, summary.succeeded === 0', async () => {
    mockGenerate.mockRejectedValue(new Error('provider down'));

    const result = await handleGenerateBatch({
      items: [{ prompt: 'a cat' }, { prompt: 'a dog' }],
      outputDir: tmp.dir,
    });

    const parsed = parseResponse(result);
    expect(parsed.status).toBe('error');
    expect(parsed.summary.succeeded).toBe(0);
    expect(parsed.summary.failed).toBe(2);
    for (const item of parsed.items) {
      expect(item.success).toBe(false);
      expect(typeof item.error).toBe('string');
    }
  });

  it('invalid provider → early error, success: false, no batchRunId', async () => {
    const result = await handleGenerateBatch({
      items: [{ prompt: 'a cat' }],
      provider: 'nonexistent-provider' as never,
    });

    const parsed = parseResponse(result);
    expect(parsed.success).toBe(false);
    expect(typeof parsed.error).toBe('string');
    expect(parsed.error).toContain('nonexistent-provider');
    expect(parsed.batchRunId).toBeUndefined();
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('style option → generate called with style prepended to prompt', async () => {
    mockGenerate.mockResolvedValue({ buffer: FAKE_PNG, model: 'test-model' });

    await handleGenerateBatch({
      items: [{ prompt: 'a mountain' }],
      style: 'watercolor',
      outputDir: tmp.dir,
    });

    expect(mockGenerate).toHaveBeenCalledOnce();
    const callArgs = mockGenerate.mock.calls[0][0] as { prompt: string };
    expect(callArgs.prompt).toMatch(/^watercolor,/);
    expect(callArgs.prompt).toContain('a mountain');
  });

  it('outputDir is used when item has no explicit outputPath', async () => {
    mockGenerate.mockResolvedValue({ buffer: FAKE_PNG, model: 'test-model' });

    const result = await handleGenerateBatch({
      items: [{ prompt: 'a cat' }],
      outputDir: tmp.dir,
    });

    const parsed = parseResponse(result);
    expect(parsed.items[0].success).toBe(true);
    const itemPath: string = parsed.items[0].path;
    expect(itemPath.startsWith(tmp.dir)).toBe(true);
    // Verify the file was actually created
    await expect(fs.access(itemPath)).resolves.not.toThrow();
  });

  it('max_concurrent: 1 → at most 1 generate call in flight at a time', async () => {
    let inFlight = 0;
    let maxObservedInFlight = 0;

    mockGenerate.mockImplementation(async () => {
      inFlight++;
      maxObservedInFlight = Math.max(maxObservedInFlight, inFlight);
      await new Promise<void>((r) => setTimeout(r, 10));
      inFlight--;
      return { buffer: FAKE_PNG, model: 'test-model' };
    });

    await handleGenerateBatch({
      items: [{ prompt: 'a cat' }, { prompt: 'a dog' }, { prompt: 'a bird' }],
      outputDir: tmp.dir,
      max_concurrent: 1,
    });

    expect(maxObservedInFlight).toBe(1);
    expect(mockGenerate).toHaveBeenCalledTimes(3);
  });

  it('manifest exists at .runs/<batchRunId>/manifest.json after successful batch', async () => {
    mockGenerate.mockResolvedValue({ buffer: FAKE_PNG, model: 'test-model' });

    const result = await handleGenerateBatch({
      items: [{ prompt: 'a cat' }, { prompt: 'a dog' }, { prompt: 'a bird' }],
      outputDir: tmp.dir,
    });

    const parsed = parseResponse(result);
    expect(parsed.batchRunId).toBeTruthy();

    // .runs is placed under IMAGE_GEN_OUTPUT_DIR (tmp.dir in tests)
    const runsRoot = path.join(tmp.dir, '.runs');
    const manifestFilePath = path.join(runsRoot, parsed.batchRunId, 'manifest.json');
    await expect(fs.access(manifestFilePath)).resolves.not.toThrow();
    const manifest = JSON.parse(await fs.readFile(manifestFilePath, 'utf-8'));
    expect(manifest.status).toBe('success');
    expect(manifest.nodes).toHaveLength(3);
    expect(manifest.invocation.tool).toBe('generate_batch');
  });

  it('empty items array → early error, success: false', async () => {
    const result = await handleGenerateBatch({
      items: [],
      outputDir: tmp.dir,
    });

    const parsed = parseResponse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('non-empty');
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('provider param applies to all items (providerName in all item results)', async () => {
    mockGenerate.mockResolvedValue({ buffer: FAKE_PNG, model: 'test-model' });

    const result = await handleGenerateBatch({
      items: [{ prompt: 'a cat' }, { prompt: 'a dog' }],
      provider: 'gemini',
      outputDir: tmp.dir,
    });

    const parsed = parseResponse(result);
    expect(parsed.status).toBe('success');
    for (const item of parsed.items) {
      expect(item.provider).toBe('gemini');
    }
  });
});
