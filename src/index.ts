#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { registry, type ProviderName } from './providers/index.js';
import { createOpenAIProvider } from './providers/openai.js';
import { createGeminiProvider } from './providers/gemini.js';
import { createReplicateProvider } from './providers/replicate.js';
import { createTogetherProvider } from './providers/together.js';
import { createGrokProvider } from './providers/grok.js';
import { saveImage, generateFilename } from './utils/image.js';

// Register available providers
const providers = [
  createOpenAIProvider(),
  createGeminiProvider(),
  createReplicateProvider(),
  createTogetherProvider(),
  createGrokProvider(),
].filter((p): p is NonNullable<typeof p> => p !== null);

for (const provider of providers) {
  registry.register(provider);
}

const DEFAULT_PROVIDER = (process.env.IMAGE_GEN_DEFAULT_PROVIDER || 'openai') as ProviderName;

// Create MCP server
const server = new McpServer({
  name: 'image-gen',
  version: '1.0.0',
});

// Define the generate_image tool
server.tool(
  'generate_image',
  'Generate an image from a text prompt using various AI providers',
  {
    prompt: z.string().describe('The text description of the image to generate'),
    provider: z
      .enum(['openai', 'gemini', 'replicate', 'together', 'grok'])
      .optional()
      .describe('The image generation provider to use'),
    model: z.string().optional().describe('Provider-specific model to use'),
    size: z
      .enum(['square', 'landscape', 'portrait'])
      .optional()
      .describe('Image size/aspect ratio'),
  },
  async ({ prompt, provider, model, size }) => {
    const providerName = provider || DEFAULT_PROVIDER;
    const imageProvider = registry.get(providerName);

    if (!imageProvider) {
      const available = registry.getAvailable();
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: `Provider '${providerName}' is not available. Available providers: ${available.join(', ')}`,
            }),
          },
        ],
      };
    }

    try {
      const result = await imageProvider.generate({
        prompt,
        model,
        size,
      });

      const filename = generateFilename(prompt, providerName);
      const filePath = await saveImage(result.buffer, filename);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              path: filePath,
              provider: providerName,
              model: result.model,
              revisedPrompt: result.revisedPrompt,
            }),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: message,
              provider: providerName,
            }),
          },
        ],
      };
    }
  }
);

// Start the server
async function main() {
  const availableProviders = registry.getAvailable();

  if (availableProviders.length === 0) {
    console.error('No image providers configured. Set at least one API key:');
    console.error('  OPENAI_API_KEY, GEMINI_API_KEY, REPLICATE_API_TOKEN, TOGETHER_API_KEY, or XAI_API_KEY');
    process.exit(1);
  }

  console.error(`Image Gen MCP Server starting...`);
  console.error(`Available providers: ${availableProviders.join(', ')}`);
  console.error(`Default provider: ${DEFAULT_PROVIDER}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
