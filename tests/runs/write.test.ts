import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { writeFileAtomic } from '../../src/runs/write.js';

describe('writeFileAtomic', () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true });
    dir = undefined;
    vi.restoreAllMocks();
  });

  it('writes the final file with no .tmp orphan on success', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wfa-'));
    const target = path.join(dir, 'out.png');

    await writeFileAtomic(target, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const entries = await fs.readdir(dir);
    expect(entries).toContain('out.png');
    expect(entries.find((e) => e.endsWith('.tmp'))).toBeUndefined();
  });

  it('leaves no final file on write failure', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wfa-'));
    const target = path.join(dir, 'missing-parent', 'out.png');

    await expect(writeFileAtomic(target, Buffer.from('x'))).rejects.toThrow();

    const exists = await fs.stat(target).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  it('accepts string payload', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wfa-'));
    const target = path.join(dir, 'manifest.json');

    await writeFileAtomic(target, '{"ok":true}');

    const text = await fs.readFile(target, 'utf8');
    expect(text).toBe('{"ok":true}');
  });
});
