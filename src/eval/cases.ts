import * as fs from 'fs/promises';
import * as path from 'path';
import type { CapabilityOp } from '../capabilities/types.js';
import type { EvalCase, EvalScorerId } from './types.js';
import { loadFixtures } from './fixtures.js';

const CASES_ROOT = path.resolve('eval/cases');

const SCORERS = new Set<EvalScorerId>([
  'alpha_coverage',
  'pixel_delta',
  'ocr_text_presence',
  'dimensions_exact',
  'palette_exact',
]);

const CAPABILITY_OPS = new Set<CapabilityOp>([
  'extract_subject',
  'edit_prompt',
  'composite_layers',
  'transform',
  'enhance_upscale',
  'analyze_dimensions',
  'analyze_palette',
  'analyze_ocr',
]);

function isEvalCase(value: unknown): value is EvalCase {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || !v.id.trim()) return false;
  if (typeof v.op !== 'string' || !CAPABILITY_OPS.has(v.op as CapabilityOp)) return false;
  if (typeof v.provider !== 'string' || !v.provider.trim()) return false;
  if (typeof v.fixtureId !== 'string' || !v.fixtureId.trim()) return false;
  if (typeof v.params !== 'object' || v.params === null) return false;
  if (!Array.isArray(v.scorers) || !v.scorers.every((s) => SCORERS.has(s as EvalScorerId))) {
    return false;
  }
  if (
    v.requiredEnv !== undefined &&
    (!Array.isArray(v.requiredEnv) || !v.requiredEnv.every((e) => typeof e === 'string'))
  ) {
    return false;
  }
  return true;
}

export async function loadEvalCases(): Promise<EvalCase[]> {
  const fixtures = await loadFixtures();
  const fixturesById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const entries = await fs.readdir(CASES_ROOT);
  const caseFiles = entries.filter((entry) => entry.endsWith('.json')).sort();
  const cases: EvalCase[] = [];
  const seenIds = new Set<string>();

  for (const file of caseFiles) {
    const raw = await fs.readFile(path.join(CASES_ROOT, file), 'utf8');
    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      throw new Error(`Eval case file must contain an array: ${file}`);
    }

    for (const entry of parsed) {
      if (!isEvalCase(entry)) {
        throw new Error(`Eval case file contains an invalid case: ${file}`);
      }
      if (seenIds.has(entry.id)) {
        throw new Error(`Duplicate eval case id: ${entry.id}`);
      }
      seenIds.add(entry.id);

      const fixture = fixturesById.get(entry.fixtureId);
      if (!fixture) {
        throw new Error(`Eval case references unknown fixture id: ${entry.fixtureId}`);
      }

      if (
        entry.params.expectedText !== undefined &&
        (typeof entry.params.expectedText !== 'string' || !entry.params.expectedText.trim())
      ) {
        throw new Error(
          `Eval case ${entry.id} has invalid params.expectedText (must be non-empty string when provided)`,
        );
      }

      if (entry.scorers.includes('ocr_text_presence') && entry.params.expectedText === undefined) {
        throw new Error(
          `Eval case ${entry.id} uses ocr_text_presence but is missing params.expectedText`,
        );
      }

      const params = { ...entry.params };
      if (params.input === '${fixture.path}') {
        params.input = fixture.path;
      }

      cases.push({ ...entry, params });
    }
  }

  return cases;
}
