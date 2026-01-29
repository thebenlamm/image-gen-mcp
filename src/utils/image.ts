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

export function getOutputDir(): string {
  const dir = expandTilde(
    process.env.IMAGE_GEN_OUTPUT_DIR || '~/Downloads/generated-images'
  );

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return dir;
}

export function generateFilename(prompt: string, provider: string): string {
  const date = new Date().toISOString().split('T')[0];
  const slug = slugify(prompt);
  const hash = crypto.randomBytes(3).toString('hex');

  return `${date}-${provider}-${slug}-${hash}.png`;
}

export async function saveImage(buffer: Buffer, filename: string): Promise<string> {
  const outputDir = getOutputDir();
  const filePath = path.join(outputDir, filename);

  await fs.promises.writeFile(filePath, buffer);

  return filePath;
}
