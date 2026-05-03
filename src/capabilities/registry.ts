import type {
  Capability,
  CapabilityKey,
  CapabilityOp,
  CapabilityRegistrationOptions,
} from './types.js';

export class CapabilityRegistry {
  private capabilities = new Map<CapabilityKey, Capability>();

  register(
    capability: Capability,
    options: CapabilityRegistrationOptions = {},
  ): void {
    const key = this.createKey(capability.op, capability.provider);
    const existing = this.capabilities.get(key);
    const incoming = { ...capability };
    const registrationQuality = capability.quality;

    if (existing && existing.modelVersion !== incoming.modelVersion) {
      incoming.quality = undefined;
    }

    const sameOpProviders = this.list(incoming.op).filter(
      (registered) => registered.provider !== incoming.provider
    );
    const hasScores = Boolean(
      incoming.quality?.scores && Object.keys(incoming.quality.scores).length > 0
    );

    if (
      sameOpProviders.length > 0 &&
      !hasScores &&
      !options.allowUnscoredProduction
    ) {
      throw new Error(
        `Capability ${incoming.op}/${incoming.provider} is unscored; add an eval case before production routing`
      );
    }

    if (options.allowUnscoredProduction === true) {
      const justification = registrationQuality?.unscoredJustification;
      if (typeof justification !== 'string' || justification.trim().length === 0) {
        throw new Error(
          `Capability ${incoming.op}/${incoming.provider} registered with allowUnscoredProduction=true requires a non-empty quality.unscoredJustification (D-09 audit trail)`
        );
      }
    }

    this.capabilities.set(key, incoming);
  }

  get(op: CapabilityOp, provider: string): Capability | undefined {
    return this.capabilities.get(this.createKey(op, provider));
  }

  unregister(op: CapabilityOp, provider: string): boolean {
    return this.capabilities.delete(this.createKey(op, provider));
  }

  list(op?: CapabilityOp): Capability[] {
    const capabilities = Array.from(this.capabilities.values());

    if (!op) {
      return capabilities;
    }

    return capabilities.filter((capability) => capability.op === op);
  }

  listScored(op?: CapabilityOp): Capability[] {
    return this.list(op).filter(
      (capability) =>
        capability.quality?.scores &&
        Object.keys(capability.quality.scores).length > 0
    );
  }

  listByProvider(provider: string): Capability[] {
    return Array.from(this.capabilities.values()).filter(
      (capability) => capability.provider === provider
    );
  }

  has(op: CapabilityOp, provider: string): boolean {
    return this.capabilities.has(this.createKey(op, provider));
  }

  private createKey(op: CapabilityOp, provider: string): CapabilityKey {
    return `${op}:${provider}`;
  }
}

export const capabilityRegistry = new CapabilityRegistry();
