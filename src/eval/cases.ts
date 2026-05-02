import * as fs from 'fs/promises';
import * as path from 'path';
import type { EvalCase, EvalScorerId } from './types.js';
import { loadFixtures } from './fixtures.js';

const CASES_ROOT = path.resolve('eval/cases');

const SCORERS = new Set<EvalScorerId>([
  'alpha_coverage',
  'pixel_delta',
  'ocr_text_presence',
]);

function isEvalCase(value: unknown): value is EvalCase {
  const evalCase = value as EvalCase;
  return (
    typeof evalCase?.id === 'string' &&
    typeof evalCase.op === 'string' &&
    typeof evalCase.provider === 'string' &&
    typeof evalCase.fixtureId === 'string' &&
    typeof evalCase.params === 'object' &&
    evalCase.params !== null &&
    Array.isArray(evalCase.scorers) &&
    evalCase.scorers.every((scorer) => SCORERS.has(scorer as EvalScorerId)) &&
    (evalCase.requiredEnv === undefined ||
      (Array.isArray(evalCase.requiredEnv) &&
        evalCase.requiredEnv.every((envName) => typeof envName === 'string')))
  );
}

export async function loadEvalCases(): Promise<EvalCase[]> {
  const fixtures = await loadFixtures();
  const fixturesById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const entries = await fs.readdir(CASES_ROOT);
  const caseFiles = entries.filter((entry) => entry.endsWith('.json')).sort();
  const cases: EvalCase[] = [];

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

      const fixture = fixturesById.get(entry.fixtureId);
      if (!fixture) {
        throw new Error(`Eval case references unknown fixture id: ${entry.fixtureId}`);
      }

      if (
        entry.scorers.includes('ocr_text_presence') &&
        (typeof entry.params.expectedText !== 'string' || !entry.params.expectedText.trim())
      ) {
        throw new Error(`Eval case ${entry.id} uses ocr_text_presence but is missing params.expectedText`);
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
