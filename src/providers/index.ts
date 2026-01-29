export type ImageSize = 'square' | 'landscape' | 'portrait';

export type ProviderName = 'openai' | 'gemini' | 'replicate' | 'together' | 'grok';

export interface GenerateParams {
  prompt: string;
  model?: string;
  size?: ImageSize;
}

export interface GenerateResult {
  buffer: Buffer;
  model: string;
  revisedPrompt?: string;
}

export interface ImageProvider {
  name: ProviderName;
  defaultModel: string;
  generate(params: GenerateParams): Promise<GenerateResult>;
}

export class ProviderRegistry {
  private providers = new Map<ProviderName, ImageProvider>();

  register(provider: ImageProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: ProviderName): ImageProvider | undefined {
    return this.providers.get(name);
  }

  getAvailable(): ProviderName[] {
    return Array.from(this.providers.keys());
  }

  has(name: ProviderName): boolean {
    return this.providers.has(name);
  }
}

export const registry = new ProviderRegistry();
