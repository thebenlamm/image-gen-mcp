import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCompositeLayersCapability } from '../../src/capabilities/composite-layers.js';
import { capabilityRegistry } from '../../src/capabilities/registry.js';
import { registerBuiltInCapabilities } from '../../src/capabilities/register.js';
import { CapabilityInvokeError } from '../../src/capabilities/types.js';
import { validateCapabilityParams } from '../../src/capabilities/validation.js';
import { scorePixelDelta } from '../../src/eval/scorers.js';

let tmpDir: string;

async function writeSolidPng(
  name: string,
  width: number,
  height: number,
  color: sharp.Color,
): Promise<string> {
  const filePath = path.join(tmpDir, name);
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: color,
    },
  }).png().toFile(filePath);
  return filePath;
}

async function rawPixel(buffer: Buffer, x: number, y: number): Promise<[number, number, number, number]> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * 4;
  return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-gen-composite-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('composite_layers capability', () => {
  it('composites one layer on a transparent canvas', async () => {
    const overlay = await writeSolidPng('overlay.png', 64, 64, { r: 255, g: 0, b: 0, alpha: 1 });
    const capability = createCompositeLayersCapability();

    const result = await capability.invoke({
      params: {
        canvas: { width: 256, height: 256 },
        layers: [{ input: overlay, x: 0, y: 0 }],
      },
    });

    expect(result.kind).toBe('image');
    if (result.kind !== 'image') throw new Error('expected image result');
    const meta = await sharp(result.buffer).metadata();
    expect(meta.width).toBe(256);
    expect(meta.height).toBe(256);
    expect(meta.channels).toBe(4);
  });

  it('uses an opaque canvas background when provided', async () => {
    const overlay = await writeSolidPng('overlay.png', 32, 32, { r: 255, g: 0, b: 0, alpha: 1 });
    const capability = createCompositeLayersCapability();

    const result = await capability.invoke({
      params: {
        canvas: { width: 128, height: 128, background: '#ffffff' },
        layers: [{ input: overlay, x: 10, y: 10 }],
      },
    });

    if (result.kind !== 'image') throw new Error('expected image result');
    expect(await rawPixel(result.buffer, 0, 0)).toEqual([255, 255, 255, 255]);
  });

  it('resolves center anchor positions', async () => {
    const overlay = await writeSolidPng('overlay.png', 64, 64, { r: 255, g: 0, b: 0, alpha: 1 });
    const capability = createCompositeLayersCapability();

    const result = await capability.invoke({
      params: {
        canvas: { width: 256, height: 256 },
        layers: [{ input: overlay, x: 128, y: 128, anchor: 'center' }],
      },
    });

    if (result.kind !== 'image') throw new Error('expected image result');
    expect(await rawPixel(result.buffer, 96, 96)).toEqual([255, 0, 0, 255]);
    expect(await rawPixel(result.buffer, 95, 95)).toEqual([0, 0, 0, 0]);
  });

  it('validates layer and canvas caps before invoke', () => {
    const capability = createCompositeLayersCapability();

    expect(() => validateCapabilityParams(capability, {
      canvas: { width: 256, height: 256 },
      layers: Array.from({ length: 17 }, (_, i) => ({ input: `layer-${i}.png` })),
    })).toThrow(/layers exceed cap of 16/);

    expect(() => validateCapabilityParams(capability, {
      canvas: { width: 8000, height: 8000 },
      layers: [{ input: 'layer.png' }],
    })).toThrow(/canvas exceeds 16MP cap/);
  });

  it('rejects scale outside the allowed range', async () => {
    const overlay = await writeSolidPng('overlay.png', 64, 64, { r: 255, g: 0, b: 0, alpha: 1 });
    const capability = createCompositeLayersCapability();

    await expect(capability.invoke({
      params: {
        canvas: { width: 256, height: 256 },
        layers: [{ input: overlay, scale: 0.04 }],
      },
    })).rejects.toBeInstanceOf(CapabilityInvokeError);
    await expect(capability.invoke({
      params: {
        canvas: { width: 256, height: 256 },
        layers: [{ input: overlay, scale: 0.04 }],
      },
    })).rejects.toMatchObject({ code: 'CONSTRAINT_VIOLATION' });
  });

  it('rejects invalid placement parameters before sharp work', async () => {
    const overlay = await writeSolidPng('overlay.png', 64, 64, { r: 255, g: 0, b: 0, alpha: 1 });
    const capability = createCompositeLayersCapability();

    expect(() => validateCapabilityParams(capability, {
      canvas: { width: 256, height: 256 },
      layers: [{ input: overlay, anchor: 'centre' }],
    })).toThrow(/anchor/);

    await expect(capability.invoke({
      params: {
        canvas: { width: 256, height: 256 },
        layers: [{ input: overlay, x: '10', y: 0 }],
      },
    })).rejects.toMatchObject({ code: 'CONSTRAINT_VIOLATION' });
  });

  it('scales layers before compositing', async () => {
    const overlay = await writeSolidPng('overlay.png', 64, 64, { r: 255, g: 0, b: 0, alpha: 1 });
    const capability = createCompositeLayersCapability();

    const result = await capability.invoke({
      params: {
        canvas: { width: 256, height: 256 },
        layers: [{ input: overlay, x: 0, y: 0, scale: 2 }],
      },
    });

    if (result.kind !== 'image') throw new Error('expected image result');
    expect(await rawPixel(result.buffer, 127, 127)).toEqual([255, 0, 0, 255]);
    expect(await rawPixel(result.buffer, 128, 128)).toEqual([0, 0, 0, 0]);
  });

  it('applies opacity by multiplying the layer alpha channel', async () => {
    const overlay = await writeSolidPng('overlay.png', 64, 64, { r: 255, g: 0, b: 0, alpha: 1 });
    const capability = createCompositeLayersCapability();

    const result = await capability.invoke({
      params: {
        canvas: { width: 128, height: 128 },
        layers: [{ input: overlay, x: 0, y: 0, opacity: 0.5 }],
      },
    });

    if (result.kind !== 'image') throw new Error('expected image result');
    const [, , , alpha] = await rawPixel(result.buffer, 10, 10);
    expect(alpha).toBeGreaterThanOrEqual(120);
    expect(alpha).toBeLessThanOrEqual(136);
  });

  it('supports fully transparent opacity on transparent and opaque canvases', async () => {
    const overlay = await writeSolidPng('overlay.png', 64, 64, { r: 255, g: 0, b: 0, alpha: 1 });
    const capability = createCompositeLayersCapability();

    const transparent = await capability.invoke({
      params: {
        canvas: { width: 128, height: 128 },
        layers: [{ input: overlay, x: 0, y: 0, opacity: 0 }],
      },
    });
    if (transparent.kind !== 'image') throw new Error('expected image result');
    expect(await rawPixel(transparent.buffer, 10, 10)).toEqual([0, 0, 0, 0]);

    const opaque = await capability.invoke({
      params: {
        canvas: { width: 128, height: 128, background: '#ffffff' },
        layers: [{ input: overlay, x: 0, y: 0, opacity: 0 }],
      },
    });
    if (opaque.kind !== 'image') throw new Error('expected image result');
    expect(await rawPixel(opaque.buffer, 10, 10)).toEqual([255, 255, 255, 255]);
  });

  it('matches the composite golden fixture', async () => {
    const capability = createCompositeLayersCapability();
    const output = await capability.invoke({
      params: {
        canvas: { width: 512, height: 512, background: { r: 255, g: 255, b: 255, alpha: 1 } },
        layers: [{ input: 'eval/fixtures/composite-overlay.png', x: 192, y: 192, anchor: 'top-left' }],
      },
    });

    if (output.kind !== 'image') throw new Error('expected image result');
    const outputPath = path.join(tmpDir, 'composite-output.png');
    await fs.writeFile(outputPath, output.buffer);

    const score = await scorePixelDelta('eval/fixtures/composite-golden.png', outputPath);
    expect(score.status).toBe('scored');
    expect(score.value).toBeLessThan(0.05);
  });

  it('registers as a built-in capability', () => {
    registerBuiltInCapabilities();

    expect(capabilityRegistry.list('composite_layers')).toHaveLength(1);
  });
});
