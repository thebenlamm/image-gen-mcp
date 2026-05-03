import { describe, expect, it } from 'vitest';
import { resolveRefs, type ResolveCtx } from '../../src/task/ref-resolver.js';

describe('resolveRefs', () => {
  it('substitutes $inputs.X with ctx.inputs[X]', () => {
    const ctx: ResolveCtx = { inputs: { product: '/tmp/product.png' }, nodeOutputs: {} };
    expect(resolveRefs('$inputs.product', ctx)).toBe('/tmp/product.png');
  });

  it('substitutes image node output refs with artifact paths', () => {
    const ctx: ResolveCtx = {
      inputs: {},
      nodeOutputs: { extract: { kind: 'image', artifactPath: '/run/nextract.png' } },
    };
    expect(resolveRefs('$nodes.extract.output', ctx)).toBe('/run/nextract.png');
  });

  it('substitutes data node output refs with data objects', () => {
    const dims = {
      type: 'dimensions',
      width: 100,
      height: 200,
      format: 'png',
      channels: 4,
      hasAlpha: true,
    };
    const ctx: ResolveCtx = {
      inputs: {},
      nodeOutputs: { dims: { kind: 'data', data: dims } },
    };
    expect(resolveRefs('$nodes.dims.output', ctx)).toEqual(dims);
  });

  it('walks nested objects and arrays', () => {
    const ctx: ResolveCtx = {
      inputs: { bg: '/tmp/bg.png' },
      nodeOutputs: { extract: { kind: 'image', artifactPath: '/run/nextract.png' } },
    };
    expect(resolveRefs({
      layers: [{ input: '$inputs.bg' }, { input: '$nodes.extract.output' }],
    }, ctx)).toEqual({
      layers: [{ input: '/tmp/bg.png' }, { input: '/run/nextract.png' }],
    });
  });

  it('walks arrays with mixed scalars and refs', () => {
    const ctx: ResolveCtx = {
      inputs: { a: '/tmp/a.png' },
      nodeOutputs: { b: { kind: 'image', artifactPath: '/run/nb.png' } },
    };
    expect(resolveRefs(['literal', '$inputs.a', 3, '$nodes.b.output'], ctx)).toEqual([
      'literal',
      '/tmp/a.png',
      3,
      '/run/nb.png',
    ]);
  });

  it('leaves literal non-ref strings unchanged', () => {
    const ctx: ResolveCtx = { inputs: { product: '/tmp/product.png' }, nodeOutputs: {} };
    expect(resolveRefs('/x/$inputs.product/y', ctx)).toBe('/x/$inputs.product/y');
  });

  it('throws on unknown inputs', () => {
    const ctx: ResolveCtx = { inputs: {}, nodeOutputs: {} };
    expect(() => resolveRefs('$inputs.missing', ctx)).toThrow(/Unknown input 'missing'/);
  });

  it('throws on unknown node outputs', () => {
    const ctx: ResolveCtx = { inputs: {}, nodeOutputs: {} };
    expect(() => resolveRefs('$nodes.missing.output', ctx)).toThrow(/missing/);
  });

  it('throws when a node output has an unrecognized kind', () => {
    const ctx = {
      inputs: {},
      nodeOutputs: { bad: { kind: 'video', artifactPath: '/run/nbad.mp4' } },
    } as unknown as ResolveCtx;
    expect(() => resolveRefs('$nodes.bad.output', ctx)).toThrow(/Unrecognized node output kind/);
  });

  it('passes through primitive values unchanged', () => {
    const ctx: ResolveCtx = { inputs: {}, nodeOutputs: {} };
    expect(resolveRefs({ n: 1, b: false, z: null, u: undefined }, ctx)).toEqual({
      n: 1,
      b: false,
      z: null,
      u: undefined,
    });
  });
});
