# Image Gen MCP Server - Design Document

## Overview

A Model Context Protocol (MCP) server that provides unified image generation across multiple providers: OpenAI, Google Gemini, Replicate, Together AI, and xAI Grok.

## Goals

- Single `generate_image` tool with optional provider selection
- Save generated images to disk, return file path
- Minimal v1 - no editing, variations, or advanced features
- Easy configuration via environment variables

## Tool Interface

### `generate_image`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Yes | The image description |
| `provider` | string | No | `openai`, `gemini`, `replicate`, `together`, `grok` |
| `model` | string | No | Provider-specific model override |
| `size` | string | No | `square`, `landscape`, `portrait` |

### Response

```json
{
  "success": true,
  "path": "/path/to/generated-image.png",
  "provider": "openai",
  "model": "gpt-image-2"
}
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `IMAGE_GEN_DEFAULT_PROVIDER` | Default provider | `openai` |
| `IMAGE_GEN_OUTPUT_DIR` | Output directory | `~/Downloads/generated-images` |
| `OPENAI_API_KEY` | OpenAI API key | - |
| `GEMINI_API_KEY` | Google Gemini API key | - |
| `REPLICATE_API_TOKEN` | Replicate API token | - |
| `TOGETHER_API_KEY` | Together AI API key | - |
| `XAI_API_KEY` | xAI/Grok API key | - |

## Provider Details

### OpenAI
- Models: `gpt-image-2` (default), `gpt-image-1`, `dall-e-3`, `dall-e-2`
- Sizes: 1024x1024 (square), 1792x1024 (landscape), 1024x1792 (portrait)

### Google Gemini
- Models: `gemini-2.5-flash-image` (default), `gemini-3-pro-image`
- Sizes: 1:1 (square), 16:9 (landscape), 9:16 (portrait)

### Replicate
- Models: `black-forest-labs/flux-1.1-pro` (default)
- Sizes: Various aspect ratios supported

### Together AI
- Models: `black-forest-labs/FLUX.1-schnell` (default)
- Sizes: Various aspect ratios supported

### xAI Grok
- Models: `grok-imagine-image` (default), `grok-imagine-image-pro`, `grok-2-image`
- Sizes: TBD based on API documentation

## Future Enhancements (v2+)

- Image editing/inpainting
- Image variations
- Batch generation
- Custom aspect ratios
- Cost tracking
