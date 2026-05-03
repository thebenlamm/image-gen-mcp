import * as fs from 'fs';
import sharp from 'sharp';
import { assertWithinInputRoot } from '../utils/path-input-root.js';
import type { Capability } from './types.js';
import { CapabilityInvokeError } from './types.js';

const MODEL_VERSION = 'photoroom-remove-bg-v2';
const FETCH_TIMEOUT_MS = 30_000;
const ENDPOINT = 'https://sdk.photoroom.com/v1/segment';

function resolveOptionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || /^\$\{[^}]+\}$/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

async function imageMimeType(buffer: Buffer): Promise<string> {
  const format = (await sharp(buffer).metadata()).format;
  if (format === 'png') return 'image/png';
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'webp') return 'image/webp';
  throw new CapabilityInvokeError('UNSUPPORTED', `extract_subject unsupported input format '${format ?? 'unknown'}'`, false);
}

export function createPhotoroomExtractSubjectCapability(): Capability | null {
  const apiKey = resolveOptionalEnv(process.env.PHOTOROOM_API_KEY);
  if (!apiKey) {
    return null;
  }

  return {
    op: 'extract_subject',
    provider: 'photoroom',
    modelVersion: MODEL_VERSION,
    constraints: {
      requiresInputImage: true,
      supportsMultipleInputs: false,
      outputFormat: 'png',
    },
    cost: { perCallUsd: 0.02 },
    latencyMsP50: 3000,
    quality: {
      unscoredJustification: 'Phase 11 initial registration; eval scores pending from photoroom extract_subject eval cases (D-12, PROV-05)',
    },
    async invoke(input) {
      const filePath = input.params.input;
      if (typeof filePath !== 'string' || !filePath.trim()) {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'extract_subject requires params.input file path', false);
      }
      try {
        await assertWithinInputRoot(filePath);
      } catch (error) {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', error instanceof Error ? error.message : String(error), false);
      }

      const source = await fs.promises.readFile(filePath);
      const mimeType = await imageMimeType(source);
      const form = new FormData();
      form.set('image_file', new Blob([source as BlobPart], { type: mimeType }), 'input');
      form.set('format', 'png');
      form.set('channels', 'rgba');

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'x-api-key': apiKey },
          body: form,
          signal: controller.signal,
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new CapabilityInvokeError('TIMEOUT', 'Photoroom segment timed out after 30s', true);
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new CapabilityInvokeError(
          'PROVIDER_FAILURE',
          body.trim() || `Photoroom segment failed with status ${response.status}`,
          true,
        );
      }

      return {
        kind: 'image',
        buffer: Buffer.from(await response.arrayBuffer()),
        model: MODEL_VERSION,
        metadata: {
          input: filePath,
          provider: 'photoroom',
          modelVersion: 'photoroom-remove-bg-v2',
          api: 'remove-background',
          qualityMeasured: false,
        },
      };
    },
  };
}
