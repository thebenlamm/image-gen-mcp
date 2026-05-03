import { createAnalyzeDimensionsCapability } from './analyze-dimensions.js';
import { createAnalyzePaletteCapability } from './analyze-palette.js';
import { createCompositeLayersCapability } from './composite-layers.js';
import { createEditPromptCapability } from './edit-prompt.js';
import { createExtractSubjectCapability } from './extract-subject.js';
import { capabilityRegistry } from './registry.js';
import { createTransformCapability } from './transform.js';

export function registerBuiltInCapabilities() {
  capabilityRegistry.register(createExtractSubjectCapability());

  const editPrompt = createEditPromptCapability();
  if (editPrompt) {
    capabilityRegistry.register(editPrompt);
  }

  capabilityRegistry.register(createTransformCapability());
  capabilityRegistry.register(createAnalyzeDimensionsCapability());
  capabilityRegistry.register(createAnalyzePaletteCapability());
  capabilityRegistry.register(createCompositeLayersCapability());

  return capabilityRegistry;
}
