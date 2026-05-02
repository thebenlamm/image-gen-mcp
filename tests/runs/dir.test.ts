import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { withTmpOutputDir, type TmpOutputDir } from '../helpers/tmpOutputDir.js';
import {
  RUN_DIR_NAME,
  resolveRunsRoot,
  resolveRunDir,
  nodeArtifactPath,
  isValidRunId,
} from '../../src/runs/dir.js';
import { createRunId } from '../../src/runs/id.js';

describe('runs/dir', () => {
  let tmp: TmpOutputDir;

  beforeEach(async () => {
    tmp = await withTmpOutputDir();
  });

  afterEach(async () => {
    await tmp.restore();
  });

  it('resolveRunsRoot creates <outputDir>/.runs/', async () => {
    const root = await resolveRunsRoot();

    expect(root).toBe(path.join(tmp.dir, RUN_DIR_NAME));
    const stat = await fs.stat(root);
    expect(stat.isDirectory()).toBe(true);
  });

  it('resolveRunDir creates <runsRoot>/<runId>/', async () => {
    const id = createRunId();
    const runDir = await resolveRunDir(id);

    expect(runDir).toBe(path.join(tmp.dir, RUN_DIR_NAME, id));
    const stat = await fs.stat(runDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it('rejects path-traversal runId', async () => {
    await expect(resolveRunDir('../etc/passwd')).rejects.toThrow(/Invalid runId/);
  });

  it('rejects malformed runId', async () => {
    await expect(resolveRunDir('run-foo')).rejects.toThrow(/Invalid runId/);
  });

  it('isValidRunId only matches the expected format', () => {
    expect(isValidRunId(createRunId())).toBe(true);
    expect(isValidRunId('run-bad')).toBe(false);
    expect(isValidRunId('../escape')).toBe(false);
  });

  it('nodeArtifactPath produces n<id>.png', () => {
    expect(nodeArtifactPath('/tmp/run', '1')).toBe('/tmp/run/n1.png');
  });

  it('nodeArtifactPath rejects traversal', () => {
    expect(() => nodeArtifactPath('/tmp/run', '../bad')).toThrow(/Invalid nodeId/);
    expect(() => nodeArtifactPath('/tmp/run', 'a/b')).toThrow(/Invalid nodeId/);
  });
});
