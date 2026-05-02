import pixelmatch from 'pixelmatch';
import sharp from 'sharp';
import type { EvalScore, EvalScorerId } from './types.js';

const SCORE_SIZE = 256;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

async function normalizedRaw(path: string): Promise<Buffer> {
  const { data } = await sharp(path)
    .resize(SCORE_SIZE, SCORE_SIZE, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return data;
}

export async function scoreAlphaCoverage(outputPath: string): Promise<EvalScore> {
  const { data, info } = await sharp(outputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  let partialAlphaPixels = 0;
  const totalPixels = info.width * info.height;

  for (let index = channels - 1; index < data.length; index += channels) {
    const alpha = data[index];
    if (alpha > 0 && alpha < 255) {
      partialAlphaPixels += 1;
    }
  }

  return {
    scorer: 'alpha_coverage',
    status: 'scored',
    value: clamp01(partialAlphaPixels / totalPixels),
  };
}

export async function scorePixelDelta(
  inputPath: string,
  outputPath: string,
): Promise<EvalScore> {
  const input = await normalizedRaw(inputPath);
  const output = await normalizedRaw(outputPath);
  const diffPixels = pixelmatch(input, output, undefined, SCORE_SIZE, SCORE_SIZE);

  return {
    scorer: 'pixel_delta',
    status: 'scored',
    value: clamp01(diffPixels / (SCORE_SIZE * SCORE_SIZE)),
  };
}

export async function scoreOcrTextPresence(
  _outputPath: string,
  _expectedText?: string,
): Promise<EvalScore> {
  return {
    scorer: 'ocr_text_presence',
    status: 'skipped',
    reason: 'ocr dependency unavailable',
  };
}

export async function runScorers(
  inputPath: string,
  outputPath: string,
  scorerIds: EvalScorerId[],
  expectedText?: string,
): Promise<EvalScore[]> {
  const scores: EvalScore[] = [];

  for (const scorerId of scorerIds) {
    if (scorerId === 'alpha_coverage') {
      scores.push(await scoreAlphaCoverage(outputPath));
    } else if (scorerId === 'pixel_delta') {
      scores.push(await scorePixelDelta(inputPath, outputPath));
    } else if (scorerId === 'ocr_text_presence') {
      scores.push(await scoreOcrTextPresence(outputPath, expectedText));
    } else {
      const exhaustive: never = scorerId;
      throw new Error(`Unsupported eval scorer: ${exhaustive}`);
    }
  }

  return scores;
}
