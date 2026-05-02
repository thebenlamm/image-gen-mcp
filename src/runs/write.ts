import * as fs from 'fs/promises';

export async function writeFileAtomic(
  filePath: string,
  data: Buffer | string,
): Promise<void> {
  const tmp = `${filePath}.tmp`;
  try {
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, filePath);
  } catch (err) {
    try {
      await fs.unlink(tmp);
    } catch {
      // Best-effort cleanup only.
    }
    throw err;
  }
}
