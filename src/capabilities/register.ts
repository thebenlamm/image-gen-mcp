import { createAnalyzeDimensionsCapability } from './analyze-dimensions.js';
import { createAnalyzeOcrCapability } from './analyze-ocr.js';
import { createAnalyzePaletteCapability } from './analyze-palette.js';
import { createCompositeLayersCapability } from './composite-layers.js';
import { createEditPromptCapability } from './edit-prompt.js';
import { createEnhanceUpscaleCapability } from './enhance-upscale.js';
import { createExtractSubjectCapability } from './extract-subject.js';
import { createFalEditPromptCapability } from './fal-edit-prompt.js';
import { createGeminiGenerateCapability } from './gemini-generate.js';
import { createGrokGenerateCapability } from './grok-generate.js';
import { createIdeogramGenerateCapability } from './ideogram-generate.js';
import { createOpenAIGenerateCapability } from './openai-generate.js';
import { createPhotoroomCompositeLayersCapability } from './photoroom-composite-layers.js';
import { createPhotoroomExtractSubjectCapability } from './photoroom-extract-subject.js';
import { capabilityRegistry } from './registry.js';
import { createReplicateGenerateCapability } from './replicate-generate.js';
import { createTogetherGenerateCapability } from './together-generate.js';
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

  const upscale = createEnhanceUpscaleCapability();
  if (upscale) {
    capabilityRegistry.register(upscale, { allowUnscoredProduction: true });
  }
  capabilityRegistry.register(createAnalyzeOcrCapability());

  const photoroomExtract = createPhotoroomExtractSubjectCapability();
  if (photoroomExtract) {
    capabilityRegistry.register(photoroomExtract, { allowUnscoredProduction: true });
  }

  const photoroomComposite = createPhotoroomCompositeLayersCapability();
  if (photoroomComposite) {
    capabilityRegistry.register(photoroomComposite, { allowUnscoredProduction: true });
  }

  const falEditPrompt = createFalEditPromptCapability();
  if (falEditPrompt) {
    capabilityRegistry.register(falEditPrompt, { allowUnscoredProduction: true });
  }

  const ideogramGenerate = createIdeogramGenerateCapability();
  if (ideogramGenerate) {
    capabilityRegistry.register(ideogramGenerate, { allowUnscoredProduction: true });
  }

  const openaiGenerate = createOpenAIGenerateCapability();
  if (openaiGenerate) {
    capabilityRegistry.register(openaiGenerate, { allowUnscoredProduction: true });
  }

  const geminiGenerate = createGeminiGenerateCapability();
  if (geminiGenerate) {
    capabilityRegistry.register(geminiGenerate, { allowUnscoredProduction: true });
  }

  const grokGenerate = createGrokGenerateCapability();
  if (grokGenerate) {
    capabilityRegistry.register(grokGenerate, { allowUnscoredProduction: true });
  }

  const replicateGenerate = createReplicateGenerateCapability();
  if (replicateGenerate) {
    capabilityRegistry.register(replicateGenerate, { allowUnscoredProduction: true });
  }

  const togetherGenerate = createTogetherGenerateCapability();
  if (togetherGenerate) {
    capabilityRegistry.register(togetherGenerate, { allowUnscoredProduction: true });
  }

  return capabilityRegistry;
}
