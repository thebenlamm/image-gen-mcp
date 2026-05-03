import pixelmatch from 'pixelmatch';
import sharp from 'sharp';
import type {
  AnalyzeDimensionsResult,
  AnalyzeOcrResult,
  AnalyzePaletteResult,
} from '../capabilities/types.js';
import { recognizeOnce } from '../utils/ocr.js';
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

  try {
    const data = await recognizeOnce(outputPath, 'eng');
    const recognizedText = normalizeOcrText(data.text);
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
  }
}

export function scoreDimensionsExact(
  data: {
    width: number;
    height: number;
    format: string;
    channels: number;
    hasAlpha: boolean;
  } | undefined,
  expected: {
    width?: number;
    height?: number;
    format?: string;
    channels?: number;
    hasAlpha?: boolean;
  } | undefined,
): EvalScore {
  if (!data || !expected) {
    return {
      scorer: 'dimensions_exact',
      status: 'error',
      reason: 'missing data or expectedDimensions',
    };
  }

  const ok =
    (expected.width === undefined || data.width === expected.width) &&
    (expected.height === undefined || data.height === expected.height) &&
    (expected.format === undefined || data.format === expected.format) &&
    (expected.channels === undefined || data.channels === expected.channels) &&
    (expected.hasAlpha === undefined || data.hasAlpha === expected.hasAlpha);

  return {
    scorer: 'dimensions_exact',
    status: 'scored',
    value: ok ? 1 : 0,
    reason: ok ? undefined : `actual=${JSON.stringify(data)} expected=${JSON.stringify(expected)}`,
  };
}

export function scorePaletteExact(
  data: { colors: Array<{ hex: string }> } | undefined,
  expected: string[] | undefined,
): EvalScore {
  if (!data || !expected || expected.length === 0) {
    return {
      scorer: 'palette_exact',
      status: 'error',
      reason: 'missing data or expectedPalette',
    };
  }

  const actualSet = new Set(data.colors.map((color) => color.hex.toLowerCase()));
  const missing = expected.filter((hex) => !actualSet.has(hex.toLowerCase()));

  return {
    scorer: 'palette_exact',
    status: 'scored',
    value: (expected.length - missing.length) / expected.length,
    reason: missing.length === 0 ? undefined : `missing=${missing.join(',')}`,
  };
}

export async function runScorers(
  inputPath: string,
  outputPath: string | undefined,
  scorerIds: EvalScorerId[],
  params: Record<string, unknown>,
  data?: AnalyzeDimensionsResult | AnalyzePaletteResult | AnalyzeOcrResult,
): Promise<EvalScore[]> {
  const scores: EvalScore[] = [];

  for (const scorerId of scorerIds) {
    if (scorerId === 'alpha_coverage') {
      if (!outputPath) {
        scores.push({ scorer: 'alpha_coverage', status: 'error', reason: 'outputPath required' });
        continue;
      }
      scores.push(await scoreAlphaCoverage(outputPath));
    } else if (scorerId === 'pixel_delta') {
      if (!outputPath) {
        scores.push({ scorer: 'pixel_delta', status: 'error', reason: 'outputPath required' });
        continue;
      }
      scores.push(await scorePixelDelta(inputPath, outputPath));
    } else if (scorerId === 'ocr_text_presence') {
      if (!outputPath) {
        scores.push({ scorer: 'ocr_text_presence', status: 'error', reason: 'outputPath required' });
        continue;
      }
      const expectedText = params.expectedText;
      scores.push(await scoreOcrTextPresence(
        outputPath,
        typeof expectedText === 'string' ? expectedText : undefined,
      ));
    } else if (scorerId === 'dimensions_exact') {
      scores.push(scoreDimensionsExact(
        data?.type === 'dimensions' ? data : undefined,
        params.expectedDimensions as {
          width?: number;
          height?: number;
          format?: string;
          channels?: number;
          hasAlpha?: boolean;
        } | undefined,
      ));
    } else if (scorerId === 'palette_exact') {
      scores.push(scorePaletteExact(
        data?.type === 'palette' ? data : undefined,
        params.expectedPalette as string[] | undefined,
      ));
    } else {
      const exhaustive: never = scorerId;
      throw new Error(`Unsupported eval scorer: ${exhaustive}`);
    }
  }

  return scores;
}
