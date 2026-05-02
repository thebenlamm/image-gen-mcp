import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

export interface TmpOutputDir {
  dir: string;
  restore: () => Promise<void>;
}

export async function withTmpOutputDir(): Promise<TmpOutputDir> {
  const prevEnv = process.env.IMAGE_GEN_OUTPUT_DIR;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-gen-mcp-test-'));
  process.env.IMAGE_GEN_OUTPUT_DIR = dir;

  return {
    dir,
    restore: async () => {
      if (prevEnv === undefined) delete process.env.IMAGE_GEN_OUTPUT_DIR;
      else process.env.IMAGE_GEN_OUTPUT_DIR = prevEnv;
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}
