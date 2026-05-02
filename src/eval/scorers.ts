import pixelmatch from 'pixelmatch';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import type { EvalScore, EvalScorerId } from './types.js';

const SCORE_SIZE = 256;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeOcrText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
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
  let coveredAlphaPixels = 0;
  const totalPixels = info.width * info.height;

  for (let index = channels - 1; index < data.length; index += channels) {
    const alpha = data[index];
    if (alpha > 0) {
      coveredAlphaPixels += 1;
    }
  }

  return {
    scorer: 'alpha_coverage',
    status: 'scored',
    value: clamp01(coveredAlphaPixels / totalPixels),
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
  outputPath: string,
  expectedText?: string,
): Promise<EvalScore> {
  if (!expectedText || !expectedText.trim()) {
    return {
      scorer: 'ocr_text_presence',
      status: 'error',
      reason: 'expectedText is required for OCR scoring',
    };
  }

  const worker = await createWorker('eng');
  try {
    const result = await worker.recognize(outputPath);
    const recognizedText = normalizeOcrText(result.data.text);
    const needle = normalizeOcrText(expectedText);
    if (recognizedText.includes(needle)) {
      return {
        scorer: 'ocr_text_presence',
        status: 'scored',
        value: 1,
      };
    }
    return {
      scorer: 'ocr_text_presence',
      status: 'scored',
      value: 0,
      reason: 'expected text not found',
    };
  } catch (error) {
    return {
      scorer: 'ocr_text_presence',
      status: 'error',
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await worker.terminate();
  }
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
