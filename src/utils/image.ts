import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

function expandTilde(filePath: string): string {
  if (filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

export async function getOutputDir(): Promise<string> {
  const dir = expandTilde(
    process.env.IMAGE_GEN_OUTPUT_DIR || '~/Downloads/generated-images'
  );

  await fs.promises.mkdir(dir, { recursive: true });

  return dir;
}

export function generateFilename(prompt: string, provider: string): string {
  const date = new Date().toISOString().split('T')[0];
  const slug = slugify(prompt);
  const hash = crypto.randomBytes(3).toString('hex');

  return `${date}-${provider}-${slug}-${hash}.png`;
}

export interface OutputOptions {
  outputPath?: string;
  outputDir?: string;
  assetId?: string;
  prompt: string;
  provider: string;
}

export async function resolveOutputPath(options: OutputOptions): Promise<string> {
  const { outputPath, outputDir, assetId, prompt, provider } = options;

  // Priority 1: Explicit outputPath (unchanged behavior)
  if (outputPath) {
    if (!outputPath.endsWith('.png')) {
      throw new Error('outputPath must end with .png');
    }
    const expanded = expandTilde(outputPath);
    const absolute = path.resolve(expanded);
    await fs.promises.mkdir(path.dirname(absolute), { recursive: true });
    return absolute;
  }

  // Priority 2: outputDir with assetId → clean filename
  if (outputDir && assetId) {
    const expanded = expandTilde(outputDir);
    const absolute = path.resolve(expanded);
    await fs.promises.mkdir(absolute, { recursive: true });
    return path.join(absolute, `${assetId}.png`);
  }

  // Priority 3: outputDir without assetId → generated filename
  if (outputDir) {
    const expanded = expandTilde(outputDir);
    const absolute = path.resolve(expanded);
    await fs.promises.mkdir(absolute, { recursive: true });
    const filename = generateFilename(prompt, provider);
    return path.join(absolute, filename);
  }

  // Priority 4: Default dir with assetId → clean filename
  if (assetId) {
    const dir = await getOutputDir();
    return path.join(dir, `${assetId}.png`);
  }

  // Priority 5: Default dir without assetId → generated filename
  const dir = await getOutputDir();
  const filename = generateFilename(prompt, provider);
  return path.join(dir, filename);
}

export async function saveImage(buffer: Buffer, filePath: string): Promise<string> {
  await fs.promises.writeFile(filePath, buffer);
  return filePath;
}
