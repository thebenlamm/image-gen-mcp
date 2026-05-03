import { recognizePooled } from '../utils/ocr.js';
import type { AnalyzeOcrResult, Capability } from './types.js';
import { CapabilityInvokeError } from './types.js';

const MODEL_VERSION = 'tesseract.js@5';
const DEFAULT_LANG = 'eng';
const SUPPORTED_LANGS = new Set(['eng']);

function resolveLang(value: unknown): string {
  if (value === undefined) {
    return DEFAULT_LANG;
  }
  if (typeof value !== 'string' || !/^[a-z]{3}(?:\+[a-z]{3}){0,2}$/.test(value)) {
    throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'analyze_ocr lang must be a tesseract language code', false);
  }
  if (!SUPPORTED_LANGS.has(value)) {
    throw new CapabilityInvokeError('UNSUPPORTED', `analyze_ocr lang '${value}' is not enabled`, false, 'Use lang=eng');
  }
  return value;
}

export function createAnalyzeOcrCapability(): Capability {
  return {
    op: 'analyze_ocr',
    provider: 'tesseract',
    modelVersion: MODEL_VERSION,
    constraints: {
      requiresInputImage: true,
      supportsMultipleInputs: false,
    },
    cost: { perCallUsd: 0 },
    latencyMsP50: 1500,
    async invoke(input) {
      const filePath = input.params.input;
      const lang = resolveLang(input.params.lang);
      const includeWords = input.params.includeWords === true;

      if (typeof filePath !== 'string' || !filePath.trim()) {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'analyze_ocr requires params.input file path', false);
      }

      const data = await recognizePooled(filePath, lang);
      const ocrData: AnalyzeOcrResult = {
        type: 'ocr',
        text: data.text,
        confidence: data.confidence,
      };

      const words = (data as { words?: Array<{
        text: string;
        confidence: number;
        bbox: { x0: number; y0: number; x1: number; y1: number };
      }> }).words;
      if (includeWords && Array.isArray(words)) {
        ocrData.words = words.map((word) => ({
          text: word.text,
          confidence: word.confidence,
          bbox: [word.bbox.x0, word.bbox.y0, word.bbox.x1, word.bbox.y1],
        }));
      } else if (includeWords) {
        ocrData.words = data.text
          .split(/\s+/)
          .filter((word) => word.length > 0)
          .map((word) => ({
            text: word,
            confidence: data.confidence,
            bbox: [0, 0, 0, 0],
          }));
      }

      return {
        kind: 'data',
        data: ocrData,
        model: MODEL_VERSION,
        metadata: { input: filePath, lang },
      };
    },
  };
}
