import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertWithinInputRoot, InputRootViolation } from '../../src/utils/path-input-root.js';

let tmpParent: string;
let tmpRoot: string;
let originalHome: string | undefined;

describe('assertWithinInputRoot', () => {
  beforeEach(async () => {
    originalHome = process.env.HOME;
    tmpParent = await fs.mkdtemp(path.join(os.tmpdir(), 'image-gen-input-root-'));
    tmpRoot = path.join(tmpParent, 'root');
    await fs.mkdir(tmpRoot);
  });

  afterEach(async () => {
    delete process.env.IMAGE_GEN_INPUT_ROOT;
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    await fs.rm(tmpParent, { recursive: true, force: true });
  });

  afterAll(() => {
    delete process.env.IMAGE_GEN_INPUT_ROOT;
  });

  it('is a no-op when IMAGE_GEN_INPUT_ROOT is unset', async () => {
    delete process.env.IMAGE_GEN_INPUT_ROOT;

    await expect(assertWithinInputRoot('/anything/path.png')).resolves.toBeUndefined();
  });

  it('allows an existing file inside the configured root', async () => {
    const filePath = path.join(tmpRoot, 'photo.png');
    await fs.writeFile(filePath, 'x');
    process.env.IMAGE_GEN_INPUT_ROOT = tmpRoot;

    await expect(assertWithinInputRoot(filePath)).resolves.toBeUndefined();
  });

  it('rejects traversal outside the configured root', async () => {
    process.env.IMAGE_GEN_INPUT_ROOT = tmpRoot;

    await expect(assertWithinInputRoot(path.join(tmpRoot, '..', 'escape.png')))
      .rejects.toBeInstanceOf(InputRootViolation);
  });

  it('rejects symlinks pointing outside the configured root', async () => {
    const outside = path.join(tmpParent, 'outside.png');
    const link = path.join(tmpRoot, 'link.png');
    await fs.writeFile(outside, 'x');
    await fs.symlink(outside, link);
    process.env.IMAGE_GEN_INPUT_ROOT = tmpRoot;

    await expect(assertWithinInputRoot(link)).rejects.toBeInstanceOf(InputRootViolation);
  });

  it('allows non-existent future paths that resolve inside the root', async () => {
    process.env.IMAGE_GEN_INPUT_ROOT = tmpRoot;

    await expect(assertWithinInputRoot(path.join(tmpRoot, 'notyetcreated.png')))
      .resolves.toBeUndefined();
  });

  it('compares against the real path when the root itself is a symlink', async () => {
    const realRoot = path.join(tmpParent, 'real-root');
    const symlinkRoot = path.join(tmpParent, 'symlink-root');
    await fs.mkdir(realRoot);
    await fs.symlink(realRoot, symlinkRoot);
    const filePath = path.join(realRoot, 'photo.png');
    await fs.writeFile(filePath, 'x');
    process.env.IMAGE_GEN_INPUT_ROOT = symlinkRoot;

    await expect(assertWithinInputRoot(filePath)).resolves.toBeUndefined();
  });

  it('expands tilde paths', async () => {
    process.env.HOME = tmpParent;
    process.env.IMAGE_GEN_INPUT_ROOT = '~/root';
    const filePath = path.join(tmpRoot, 'file.png');
    await fs.writeFile(filePath, 'x');

    await expect(assertWithinInputRoot('~/root/file.png')).resolves.toBeUndefined();
  });
});
