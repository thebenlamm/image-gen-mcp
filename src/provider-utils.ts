import { registry, type ProviderName, type ImageProvider } from './providers/index.js';

const VALID_PROVIDERS: ProviderName[] = ['openai', 'gemini', 'replicate', 'together', 'grok'];

export function resolveDefaultProvider(): ProviderName {
  const envValue = process.env.IMAGE_GEN_DEFAULT_PROVIDER?.trim();
  if (envValue) {
    if (VALID_PROVIDERS.includes(envValue as ProviderName)) {
      return envValue as ProviderName;
    }
    const available = registry.getAvailable();
    const fallback = available[0] || 'grok';
    console.error(`Warning: IMAGE_GEN_DEFAULT_PROVIDER='${envValue}' is not a valid provider. Valid: ${VALID_PROVIDERS.join(', ')}. Falling back to '${fallback}'.`);
    return fallback;
  }
  return 'grok';
}

export function resolveProvider(
  requested: ProviderName | undefined,
  needsSize: boolean,
  defaultProvider: ProviderName,
): { provider: ImageProvider; providerName: ProviderName; sizeDropped?: boolean } | { error: string; providerName: ProviderName } {
  let providerName = requested || defaultProvider;
  let provider = registry.get(providerName);

  // Only auto-fallback to a size-capable provider when no explicit provider was requested
  if (provider && needsSize && !provider.supportsSize) {
    if (!requested) {
      const sizeCapable = registry.getSizeCapable();
      if (sizeCapable.length > 0) {
        providerName = sizeCapable[0];
        provider = registry.get(providerName);
      }
    } else {
      // User explicitly chose this provider — proceed without size rather than silently switching
      return { provider, providerName, sizeDropped: true };
    }
  }

  if (!provider) {
    const available = registry.getAvailable();
    return {
      providerName,
      error: `Provider '${providerName}' is not available. Available providers: ${available.join(', ')}`,
    };
  }

  return { provider, providerName };
}

export function buildEffectivePrompt(prompt: string, style?: string): string {
  return style ? `${style}, ${prompt}` : prompt;
}
