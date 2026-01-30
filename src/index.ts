#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

import { registry, type ProviderName } from './providers/index.js';
import { createOpenAIProvider } from './providers/openai.js';
import { createGeminiProvider } from './providers/gemini.js';
import { createReplicateProvider } from './providers/replicate.js';
import { createTogetherProvider } from './providers/together.js';
import { createGrokProvider } from './providers/grok.js';
import { resolveOutputPath, saveImage } from './utils/image.js';
import { applyOperations, type ProcessingOperation } from './utils/processing.js';

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

const DEFAULT_PROVIDER = (process.env.IMAGE_GEN_DEFAULT_PROVIDER || 'grok') as ProviderName;

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
    outputPath: z.string().optional().describe('Exact output file path (must end in .png)'),
    outputDir: z.string().optional().describe('Output directory (filename auto-generated)'),
    style: z.string().optional().describe('Style modifier prepended to the generation prompt (e.g., "watercolor painting", "pixel art", "photorealistic")'),
  },
  async ({ prompt, provider, model, size, outputPath, outputDir, style }) => {
    let providerName = provider || DEFAULT_PROVIDER;
    let imageProvider = registry.get(providerName);

    // Size-aware selection: if size is specified and provider doesn't support it,
    // find next available provider that does
    if (imageProvider && size && !imageProvider.supportsSize) {
      const sizeCapable = registry.getSizeCapable();
      if (sizeCapable.length > 0) {
        providerName = sizeCapable[0];
        imageProvider = registry.get(providerName);
      }
    }

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
      // Apply style modifier to prompt (providers are unaware of style)
      const effectivePrompt = style ? `${style}, ${prompt}` : prompt;

      const result = await imageProvider.generate({
        prompt: effectivePrompt,
        model,
        size,
      });

      const filePath = await resolveOutputPath({
        outputPath,
        outputDir,
        prompt,
        provider: providerName,
      });
      await saveImage(result.buffer, filePath);

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
              availableProviders: registry.getAvailable(),
            }),
          },
        ],
      };
    }
  }
);

// Define the process_image tool
server.tool(
  'process_image',
  'Process an existing image with resize, crop, aspect crop, and circle mask operations. Operations execute in the order specified.',
  {
    inputPath: z.string().describe('Path to the input image file'),
    operations: z.array(z.union([
      z.object({
        type: z.literal('resize'),
        width: z.number().optional().describe('Target width in pixels'),
        height: z.number().optional().describe('Target height in pixels'),
        fit: z.enum(['cover', 'contain', 'fill']).optional().describe('How to fit image to dimensions (default: cover)'),
      }),
      z.object({
        type: z.literal('crop'),
        x: z.number().describe('Left offset in pixels'),
        y: z.number().describe('Top offset in pixels'),
        width: z.number().describe('Crop width in pixels'),
        height: z.number().describe('Crop height in pixels'),
      }),
      z.object({
        type: z.literal('aspectCrop'),
        ratio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).describe('Target aspect ratio'),
        gravity: z.enum(['center', 'north', 'south', 'east', 'west']).optional().describe('Crop anchor position (default: center)'),
      }),
      z.object({
        type: z.literal('circleMask'),
      }),
    ])).describe('Array of processing operations to apply in order'),
    outputPath: z.string().optional().describe('Output file path (must end in .png). Defaults to input path with _processed suffix'),
  },
  async ({ inputPath, operations, outputPath }) => {
    try {
      // Read input file
      const inputBuffer = await fs.promises.readFile(inputPath);

      // Apply operations
      const result = await applyOperations(inputBuffer, operations as ProcessingOperation[]);

      // Determine output path
      const finalOutputPath = outputPath || inputPath.replace(/\.png$/i, '_processed.png');
      if (!finalOutputPath.endsWith('.png')) {
        throw new Error('Output path must end with .png');
      }

      // Ensure output directory exists
      await fs.promises.mkdir(path.dirname(finalOutputPath), { recursive: true });

      // Save result
      await fs.promises.writeFile(finalOutputPath, result.buffer);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            inputPath,
            outputPath: finalOutputPath,
            originalSize: { width: result.originalInfo.width, height: result.originalInfo.height },
            outputSize: { width: result.outputInfo.width, height: result.outputInfo.height },
            operationsApplied: result.operationsApplied,
          }),
        }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: false,
            error: message,
            inputPath,
          }),
        }],
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
  console.error(`Default provider: ${DEFAULT_PROVIDER}${registry.has(DEFAULT_PROVIDER) ? '' : ' (not available, will need explicit provider)'}`);
  console.error(`Size-capable providers: ${registry.getSizeCapable().join(', ')}`);
  console.error(`Processing operations: resize, crop, aspectCrop, circleMask`);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
