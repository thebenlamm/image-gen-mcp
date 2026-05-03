import * as fs from 'fs';
import Replicate from 'replicate';
import sharp from 'sharp';
import type { Capability } from './types.js';
import { CapabilityInvokeError } from './types.js';

const MODEL = 'nightmareai/real-esrgan';
const MODEL_VERSION = 'nightmareai/real-esrgan@latest';
const MAX_INPUT_PIXELS = 4_000_000;
const MAX_OUTPUT_PIXELS = 16_000_000;
const FETCH_TIMEOUT_MS = 30_000;
const FETCH_RETRIES = 1;
const UNSCORED_JUSTIFICATION =
  'No deterministic scorer exists for upscaling -- would require LPIPS or human eval, neither in Phase 7 scope.';
const COST_PER_MEGAPIXEL_USD = 0.0023;

function resolveOptionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || /^\$\{[^}]+\}$/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

async function fetchWithTimeoutRetry(
  url: string,
  timeoutMs: number,
  retries: number,
): Promise<Buffer> {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      clearTimeout(timer);
      return Buffer.from(arrayBuffer);
    } catch (error) {
      clearTimeout(timer);
      if (attempt === retries) {
        throw new CapabilityInvokeError(
          'TIMEOUT',
          `Replicate URL fetch failed after ${retries + 1} attempts: ${error instanceof Error ? error.message : String(error)}`,
          true,
        );
      }
    }
  }

  throw new CapabilityInvokeError('PROVIDER_FAILURE', 'unreachable', true);
}

function getOutputUrl(output: unknown): string {
  const imageUrl = Array.isArray(output) ? output[0] : output;
  if (typeof imageUrl !== 'string') {
    throw new CapabilityInvokeError('PROVIDER_FAILURE', 'Replicate returned no image URL', true);
  }
  return imageUrl;
}

function imageMimeType(format: string | undefined): string {
  if (format === 'png') return 'image/png';
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'webp') return 'image/webp';
  throw new CapabilityInvokeError('UNSUPPORTED', `enhance_upscale unsupported input format '${format ?? 'unknown'}'`, false);
}

export function createEnhanceUpscaleCapability(): Capability | null {
  const apiToken = resolveOptionalEnv(process.env.REPLICATE_API_TOKEN);
  if (!apiToken) {
    return null;
  }

  const client = new Replicate({ auth: apiToken });

  return {
    op: 'enhance_upscale',
    provider: 'replicate',
    modelVersion: MODEL_VERSION,
    constraints: {
      requiresInputImage: true,
      supportsMultipleInputs: false,
      outputFormat: 'png',
    },
    cost: { perMegapixelUsd: COST_PER_MEGAPIXEL_USD },
    latencyMsP50: 8000,
    quality: { unscoredJustification: UNSCORED_JUSTIFICATION },
    async invoke(input) {
      const filePath = input.params.input;
      const scale = (input.params.scale as number | undefined) ?? 2;
      const faceEnhance = (input.params.face_enhance as boolean | undefined) ?? false;

      if (typeof filePath !== 'string' || !filePath.trim()) {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'enhance_upscale requires params.input file path', false);
      }
      if (scale !== 2 && scale !== 4) {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'enhance_upscale scale must be 2 or 4', false);
      }
      if (typeof faceEnhance !== 'boolean') {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'enhance_upscale face_enhance must be boolean', false);
      }

      const buffer = await fs.promises.readFile(filePath);
      const meta = await sharp(buffer).metadata();
      const mimeType = imageMimeType(meta.format);
      const inputPixels = (meta.width ?? 0) * (meta.height ?? 0);
      if (inputPixels <= 0) {
        throw new CapabilityInvokeError('PROVIDER_FAILURE', 'sharp returned no input dimensions', false);
      }
      if (inputPixels > MAX_INPUT_PIXELS) {
        throw new CapabilityInvokeError(
          'INPUT_TOO_LARGE',
          'enhance_upscale input exceeds 4MP cap',
          false,
          'reduce scale or downscale input',
        );
      }
      const outputPixels = inputPixels * scale * scale;
      if (outputPixels > MAX_OUTPUT_PIXELS) {
        throw new CapabilityInvokeError(
          'INPUT_TOO_LARGE',
          'enhance_upscale output would exceed 16MP cap',
          false,
          'reduce scale or downscale input',
        );
      }

      const prediction = await client.predictions.create({
        model: MODEL,
        input: {
          image: `data:${mimeType};base64,${buffer.toString('base64')}`,
          scale,
          face_enhance: faceEnhance,
        },
      });
      const finalPrediction = await client.wait(prediction);
      const fetchedBuffer = await fetchWithTimeoutRetry(
        getOutputUrl(finalPrediction.output),
        FETCH_TIMEOUT_MS,
        FETCH_RETRIES,
      );

      return {
        kind: 'image',
        buffer: fetchedBuffer,
        model: MODEL_VERSION,
        metadata: {
          input: filePath,
          scale,
          face_enhance: faceEnhance,
          predictionId: finalPrediction.id,
          inputMP: inputPixels / 1e6,
          outputMP: outputPixels / 1e6,
        },
      };
    },
  };
}
