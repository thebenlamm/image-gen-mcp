import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';

const MODULE_PATH = '../../src/task/sharp-config.js';

describe('sharp config', () => {
  afterEach(() => {
    vi.doUnmock('sharp');
    vi.resetModules();
  });

  it('sets sharp concurrency to 2 exactly once at module load and relies on ESM caching', async () => {
    const concurrency = vi.fn(() => 2);
    vi.doMock('sharp', () => ({ default: { concurrency } }));

    await import(MODULE_PATH);
    await import(MODULE_PATH);

    expect(concurrency).toHaveBeenCalledTimes(1);
    expect(concurrency).toHaveBeenCalledWith(2);
  });

  it('exports the shared sharp and DAG concurrency limits', async () => {
    const concurrency = vi.fn(() => 2);
    vi.doMock('sharp', () => ({ default: { concurrency } }));

    const config = await import(MODULE_PATH);

    expect(config.SHARP_CONCURRENCY_LIMIT).toBe(2);
    expect(config.MAX_PARALLEL_NODES).toBe(2);
  });

  it('sets the real sharp concurrency getter to 2 after import', async () => {
    vi.doUnmock('sharp');

    await import(MODULE_PATH);

    expect(sharp.concurrency()).toBe(2);
  });
});
