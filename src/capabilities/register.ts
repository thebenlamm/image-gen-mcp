import { createEditPromptCapability } from './edit-prompt.js';
import { createExtractSubjectCapability } from './extract-subject.js';
import { capabilityRegistry } from './registry.js';

export function registerBuiltInCapabilities() {
  capabilityRegistry.register(createExtractSubjectCapability());

  const editPrompt = createEditPromptCapability();
  if (editPrompt) {
    capabilityRegistry.register(editPrompt);
  }

  return capabilityRegistry;
}
