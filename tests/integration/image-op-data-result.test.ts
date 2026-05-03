import * as fs from 'fs/promises';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { withTmpOutputDir, type TmpOutputDir } from '../helpers/tmpOutputDir.js';
import { handleImageOp } from '../../src/index.js';

async function callImageOp(args: Parameters<typeof handleImageOp>[0]): Promise<any> {
  const result = await handleImageOp(args);
  return JSON.parse(result.content[0].text);
}

describe('image_op data results', () => {
  let tmp: TmpOutputDir;

  beforeEach(async () => {
    tmp = await withTmpOutputDir();
  });

  afterEach(async () => {
    await tmp.restore();
  });

  it('returns data without writing run artifact or user output', async () => {
    const outputPath = path.join(tmp.dir, 'ignored-output.png');
    const res = await callImageOp({
      op: 'analyze_dimensions',
      provider: 'sharp',
      params: { input: path.resolve('eval/fixtures/dims-256x128.png') },
      outputPath,
    });

    expect(res.success).toBe(true);
    expect(res.data).toEqual({
      type: 'dimensions',
      width: 256,
      height: 128,
      format: 'png',
      channels: 4,
      hasAlpha: true,
    });
    expect(res.runId).toEqual(expect.any(String));
    expect(res.trace.nodes[0]).not.toHaveProperty('artifactPath');
    expect(res.trace.nodes[0]).not.toHaveProperty('output');

    const runN1 = path.join(tmp.dir, '.runs', res.runId, 'n1.png');
    await expect(fs.stat(runN1)).rejects.toThrow();
    await expect(fs.stat(outputPath)).rejects.toThrow();
  });
});
