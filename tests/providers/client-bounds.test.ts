import { afterEach, describe, expect, it, vi } from 'vitest';

const openaiCtor = vi.fn();
const replicateCtor = vi.fn();
vi.mock('openai', () => ({ default: vi.fn().mockImplementation((opts) => { openaiCtor(opts); return { images: {} }; }) }));
vi.mock('replicate', () => ({ default: vi.fn().mockImplementation((opts) => { replicateCtor(opts); return {}; }) }));

const { createOpenAIProvider } = await import('../../src/providers/openai.js');
const { createReplicateProvider } = await import('../../src/providers/replicate.js');
const { createOpenAIGenerateCapability } = await import('../../src/capabilities/openai-generate.js');
const { createEditPromptCapability } = await import('../../src/capabilities/edit-prompt.js');

afterEach(() => {
  vi.unstubAllEnvs();
  openaiCtor.mockClear();
  replicateCtor.mockClear();
});

describe('provider client bounds', () => {
  it('OpenAI client has an explicit timeout and retry count (SDK default is 10 min)', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    createOpenAIProvider();
    expect(openaiCtor).toHaveBeenCalledWith(expect.objectContaining({ timeout: 300_000, maxRetries: 2 }));
  });

  it('Replicate client returns URL strings, not FileOutput streams', () => {
    vi.stubEnv('REPLICATE_API_TOKEN', 'r8-test');
    createReplicateProvider();
    expect(replicateCtor).toHaveBeenCalledWith(expect.objectContaining({ useFileOutput: false }));
  });

  it('capabilities that retry internally are flagged so the DAG executor does not stack retries', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    expect(createOpenAIGenerateCapability()?.retriesInternally).toBe(true);
    expect(createEditPromptCapability()?.retriesInternally).toBe(true);
  });
});
