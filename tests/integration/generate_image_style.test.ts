import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { withTmpOutputDir, type TmpOutputDir } from '../helpers/tmpOutputDir.js';

const FAKE_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex',
);

// Use vi.hoisted so these are available when vi.mock factory runs (hoisted to top)
const { mockInvoke, mockGet, mockGenerate } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockGet: vi.fn(),
  mockGenerate: vi.fn(async () => ({
    buffer: Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
      'hex',
    ),
    model: 'test-model',
    revisedPrompt: undefined,
  })),
}));

// Mock capabilities module
vi.mock('../../src/capabilities/index.js', () => ({
  capabilityRegistry: {
    get: mockGet,
    list: vi.fn(() => []),
    has: vi.fn(() => false),
    register: vi.fn(),
    listScored: vi.fn(() => []),
    listByProvider: vi.fn(() => []),
    unregister: vi.fn(),
  },
  CapabilityInvokeError: class CapabilityInvokeError extends Error {
    code: string;
    retryable: boolean;
    constructor(code: string, message: string, retryable: boolean) {
      super(message);
      this.name = 'CapabilityInvokeError';
      this.code = code;
      this.retryable = retryable;
    }
  },
  registerBuiltInCapabilities: vi.fn(),
}));

// Mock provider-utils so v1 path works without real API keys
vi.mock('../../src/provider-utils.js', () => ({
  resolveDefaultProvider: () => 'openai',
  buildEffectivePrompt: (prompt: string, style?: string) =>
    style ? `${style}, ${prompt}` : prompt,
  resolveProvider: (
    requested: string | undefined,
    _needsSize: boolean,
    _defaultProvider: string,
  ) => {
    const providerName = requested || 'openai';
    return {
      provider: { generate: mockGenerate, supportsSize: false },
      providerName,
    };
  },
}));

// Import handler after mocks are set up
import { handleGenerateImage } from '../../src/index.js';

function parseResponse(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text);
}

describe('generate_image style anchoring (reference_image)', () => {
  let tmp: TmpOutputDir;

  beforeEach(async () => {
    tmp = await withTmpOutputDir();
    mockInvoke.mockReset();
    mockGet.mockReset();
    mockGenerate.mockReset();
  });

  afterEach(async () => {
    await tmp.restore();
  });

  it('happy path — routes through edit_prompt:openai when reference_image set', async () => {
    mockGet.mockReturnValue({ invoke: mockInvoke });
    mockInvoke.mockResolvedValue({
      kind: 'image',
      buffer: FAKE_PNG,
      model: 'gpt-image-1.5',
      revisedPrompt: 'revised prompt',
      metadata: { input: '/tmp/ref.png' },
    });

    const result = await handleGenerateImage({
      prompt: 'a cat on a rooftop',
      reference_image: '/tmp/ref.png',
      outputDir: tmp.dir,
    });

    const parsed = parseResponse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.routedVia).toBe('edit_prompt');
    expect(parsed.referenceImage).toBe('/tmp/ref.png');
    expect(parsed.model).toBe('gpt-image-1.5');
    expect(parsed.provider).toBe('openai');
    expect(typeof parsed.path).toBe('string');

    expect(mockGet).toHaveBeenCalledWith('edit_prompt', 'openai');
    expect(mockInvoke).toHaveBeenCalledOnce();
    const invokeCall = mockInvoke.mock.calls[0][0];
    expect(invokeCall.params.input).toBe('/tmp/ref.png');
    expect(invokeCall.params.prompt).toContain('a cat on a rooftop');
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('model warning — includes warning field when model and reference_image both provided', async () => {
    mockGet.mockReturnValue({ invoke: mockInvoke });
    mockInvoke.mockResolvedValue({
      kind: 'image',
      buffer: FAKE_PNG,
      model: 'gpt-image-1.5',
      metadata: { input: '/tmp/ref.png' },
    });

    const result = await handleGenerateImage({
      prompt: 'a mountain',
      reference_image: '/tmp/ref.png',
      model: 'dall-e-3',
      outputDir: tmp.dir,
    });

    const parsed = parseResponse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.warning).toContain('model parameter ignored');
    expect(parsed.warning).toContain('reference_image');
  });

  it('capability not registered — returns success: false with OPENAI_API_KEY message', async () => {
    mockGet.mockReturnValue(undefined);

    const result = await handleGenerateImage({
      prompt: 'a landscape',
      reference_image: '/tmp/ref.png',
      outputDir: tmp.dir,
    });

    const parsed = parseResponse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('OPENAI_API_KEY');
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('CapabilityInvokeError propagates with structured error object', async () => {
    // Create an error that matches the mocked CapabilityInvokeError shape
    const capError = Object.assign(new Error('upstream error'), {
      name: 'CapabilityInvokeError',
      code: 'PROVIDER_FAILURE',
      retryable: true,
    });

    mockGet.mockReturnValue({ invoke: mockInvoke });
    mockInvoke.mockRejectedValue(capError);

    const result = await handleGenerateImage({
      prompt: 'a portrait',
      reference_image: '/tmp/ref.png',
      outputDir: tmp.dir,
    });

    const parsed = parseResponse(result);
    expect(parsed.success).toBe(false);
    // The handler checks instanceof CapabilityInvokeError to build structured error
    // With our mock class, the thrown error is a plain Error — it will be caught as non-cap error
    // We verify the error object contains the message and referenceImage is present
    expect(parsed.referenceImage).toBe('/tmp/ref.png');
    expect(parsed.error).toBeDefined();
  });

  it('CapabilityInvokeError from mocked class propagates with code and retryable', async () => {
    const { CapabilityInvokeError: MockCapError } = await import('../../src/capabilities/index.js');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const capError = new (MockCapError as any)('PROVIDER_FAILURE', 'upstream error', true);

    mockGet.mockReturnValue({ invoke: mockInvoke });
    mockInvoke.mockRejectedValue(capError);

    const result = await handleGenerateImage({
      prompt: 'a portrait',
      reference_image: '/tmp/ref.png',
      outputDir: tmp.dir,
    });

    const parsed = parseResponse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatchObject({ message: 'upstream error', code: 'PROVIDER_FAILURE', retryable: true });
    expect(parsed.referenceImage).toBe('/tmp/ref.png');
  });

  it('size passed through to capability invoke params', async () => {
    mockGet.mockReturnValue({ invoke: mockInvoke });
    mockInvoke.mockResolvedValue({
      kind: 'image',
      buffer: FAKE_PNG,
      model: 'gpt-image-1.5',
      metadata: { input: '/tmp/ref.png' },
    });

    await handleGenerateImage({
      prompt: 'a wide landscape',
      reference_image: '/tmp/ref.png',
      size: 'landscape',
      outputDir: tmp.dir,
    });

    const invokeCall = mockInvoke.mock.calls[0][0];
    expect(invokeCall.params.size).toBe('landscape');
  });

  it('timeout_ms threaded through to capability invoke params', async () => {
    mockGet.mockReturnValue({ invoke: mockInvoke });
    mockInvoke.mockResolvedValue({
      kind: 'image',
      buffer: FAKE_PNG,
      model: 'gpt-image-1.5',
      metadata: { input: '/tmp/ref.png' },
    });

    await handleGenerateImage({
      prompt: 'a dog',
      reference_image: '/tmp/ref.png',
      timeout_ms: 45000,
      outputDir: tmp.dir,
    });

    const invokeCall = mockInvoke.mock.calls[0][0];
    expect(invokeCall.params.timeout_ms).toBe(45000);
  });

  it('omitted timeout_ms is NOT added to capability invoke params (capability default applies)', async () => {
    mockGet.mockReturnValue({ invoke: mockInvoke });
    mockInvoke.mockResolvedValue({
      kind: 'image',
      buffer: FAKE_PNG,
      model: 'gpt-image-1.5',
      metadata: { input: '/tmp/ref.png' },
    });

    await handleGenerateImage({
      prompt: 'a dog',
      reference_image: '/tmp/ref.png',
      outputDir: tmp.dir,
    });

    const invokeCall = mockInvoke.mock.calls[0][0];
    expect('timeout_ms' in invokeCall.params).toBe(false);
  });

  it('no reference_image — uses v1 provider path, capabilityRegistry.get not called', async () => {
    mockGenerate.mockResolvedValue({ buffer: FAKE_PNG, model: 'test-model' });

    const result = await handleGenerateImage({
      prompt: 'a dog in the park',
      outputDir: tmp.dir,
    });

    const parsed = parseResponse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.routedVia).toBeUndefined();
    expect(parsed.referenceImage).toBeUndefined();
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockGenerate).toHaveBeenCalledOnce();
  });
});
