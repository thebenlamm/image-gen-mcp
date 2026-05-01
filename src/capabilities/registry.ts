import type { Capability, CapabilityKey, CapabilityOp } from './types.js';

export class CapabilityRegistry {
  private capabilities = new Map<CapabilityKey, Capability>();

  register(capability: Capability): void {
    const key = this.createKey(capability.op, capability.provider);
    const existing = this.capabilities.get(key);
    const incoming = { ...capability };

    if (existing && existing.modelVersion !== incoming.modelVersion) {
      incoming.quality = undefined;
    }

    this.capabilities.set(key, incoming);
  }

  get(op: CapabilityOp, provider: string): Capability | undefined {
    return this.capabilities.get(this.createKey(op, provider));
  }

  list(op?: CapabilityOp): Capability[] {
    const capabilities = Array.from(this.capabilities.values());

    if (!op) {
      return capabilities;
    }

    return capabilities.filter((capability) => capability.op === op);
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
