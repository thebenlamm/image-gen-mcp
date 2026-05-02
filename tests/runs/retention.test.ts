import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { withTmpOutputDir, type TmpOutputDir } from '../helpers/tmpOutputDir.js';
import {
  parseRetentionHours,
  sweepRunArtifacts,
  DEFAULT_RETENTION_HOURS,
} from '../../src/runs/retention.js';
import { resolveRunsRoot } from '../../src/runs/dir.js';
import { createRunId } from '../../src/runs/id.js';

describe('parseRetentionHours', () => {
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errSpy.mockRestore();
  });

  it('returns default for undefined/empty', () => {
    expect(parseRetentionHours(undefined)).toBe(DEFAULT_RETENTION_HOURS);
    expect(parseRetentionHours('')).toBe(DEFAULT_RETENTION_HOURS);
  });

  it('parses valid numeric strings', () => {
    expect(parseRetentionHours('1')).toBe(1);
    expect(parseRetentionHours('0')).toBe(0);
    expect(parseRetentionHours('1.5')).toBe(1.5);
  });

  it('falls back on garbage and warns', () => {
    expect(parseRetentionHours('abc')).toBe(DEFAULT_RETENTION_HOURS);
    expect(errSpy).toHaveBeenCalled();
  });

  it('falls back on negative and warns', () => {
    expect(parseRetentionHours('-3')).toBe(DEFAULT_RETENTION_HOURS);
    expect(errSpy).toHaveBeenCalled();
  });

  it('falls back on NaN string and warns', () => {
    expect(parseRetentionHours('NaN')).toBe(DEFAULT_RETENTION_HOURS);
    expect(errSpy).toHaveBeenCalled();
  });
});

describe('sweepRunArtifacts', () => {
  let tmp: TmpOutputDir;

  beforeEach(async () => {
    tmp = await withTmpOutputDir();
  });

  afterEach(async () => {
    await tmp.restore();
  });

  async function makeRun(ageMs: number): Promise<string> {
    const id = createRunId();
    const root = await resolveRunsRoot();
    const dir = path.join(root, id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'n1.png'), Buffer.from([0]));
    const t = (Date.now() - ageMs) / 1000;
    await fs.utimes(dir, t, t);
    return dir;
  }

  it('deletes runs older than retentionHours', async () => {
    const oldDir = await makeRun(2 * 60 * 60 * 1000);

    const result = await sweepRunArtifacts(1);

    expect(result.deleted).toBe(1);
    const exists = await fs.stat(oldDir).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  it('keeps runs younger than retentionHours', async () => {
    const newDir = await makeRun(30 * 60 * 1000);

    const result = await sweepRunArtifacts(1);

    expect(result.deleted).toBe(0);
    const exists = await fs.stat(newDir).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it('skips non-run-id siblings', async () => {
    const root = await resolveRunsRoot();
    const sibling = path.join(root, 'not-a-run');
    const runPrefixedSibling = path.join(root, 'run-important');
    await fs.mkdir(sibling, { recursive: true });
    await fs.mkdir(runPrefixedSibling, { recursive: true });
    await makeRun(2 * 60 * 60 * 1000);

    const result = await sweepRunArtifacts(1);

    expect(result.deleted).toBe(1);
    const survives = await fs.stat(sibling).then(() => true).catch(() => false);
    const runPrefixedSurvives = await fs.stat(runPrefixedSibling).then(() => true).catch(() => false);
    expect(survives).toBe(true);
    expect(runPrefixedSurvives).toBe(true);
  });

  it('skips symbolic links pointing outside .runs/', async () => {
    const root = await resolveRunsRoot();
    const outside = path.join(tmp.dir, 'outside');
    await fs.mkdir(outside, { recursive: true });
    await fs.writeFile(path.join(outside, 'sentinel.txt'), 'keep me');
    const linkPath = path.join(root, 'run-evil-link');

    try {
      await fs.symlink(outside, linkPath, 'dir');
    } catch {
      return;
    }

    const result = await sweepRunArtifacts(0);
    const sentinel = await fs.stat(path.join(outside, 'sentinel.txt'))
      .then(() => true)
      .catch(() => false);

    expect(sentinel).toBe(true);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });

  it('does not throw when .runs/ does not exist', async () => {
    const result = await sweepRunArtifacts(1);

    expect(result.scanned).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it('retentionHours=0 deletes all runs', async () => {
    await makeRun(60 * 1000);
    await makeRun(60 * 1000);

    const result = await sweepRunArtifacts(0);

    expect(result.deleted).toBe(2);
  });
});
