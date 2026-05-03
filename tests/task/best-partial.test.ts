import { describe, expect, it } from 'vitest';
import {
  selectBestPartial,
  type BestPartialPlanShape,
  type NodeOutcome,
} from '../../src/task/best-partial.js';

function image(path: string): NodeOutcome {
  return { status: 'success', output: { kind: 'image', artifactPath: path } };
}

describe('selectBestPartial', () => {
  it('returns the terminal image when all nodes succeeded', () => {
    const plan: BestPartialPlanShape = {
      terminalNodeId: 'C',
      nodes: [
        { id: 'A', dependsOn: [], outputKind: 'image' },
        { id: 'B', dependsOn: ['A'], outputKind: 'image' },
        { id: 'C', dependsOn: ['B'], outputKind: 'image' },
      ],
    };
    const outcomes = new Map<string, NodeOutcome>([
      ['A', image('/run/nA.png')],
      ['B', image('/run/nB.png')],
      ['C', image('/run/nC.png')],
    ]);
    expect(selectBestPartial(plan, outcomes)).toEqual({ nodeId: 'C', artifactPath: '/run/nC.png' });
  });

  it('returns a successful direct dependency when the terminal failed', () => {
    const plan: BestPartialPlanShape = {
      terminalNodeId: 'C',
      nodes: [
        { id: 'A', dependsOn: [], outputKind: 'image' },
        { id: 'B', dependsOn: ['A'], outputKind: 'image' },
        { id: 'C', dependsOn: ['B'], outputKind: 'image' },
      ],
    };
    const outcomes = new Map<string, NodeOutcome>([
      ['A', image('/run/nA.png')],
      ['B', image('/run/nB.png')],
      ['C', { status: 'error' }],
    ]);
    expect(selectBestPartial(plan, outcomes)).toEqual({ nodeId: 'B', artifactPath: '/run/nB.png' });
  });

  it('walks to deeper transitive dependencies when nearer nodes failed or skipped', () => {
    const plan: BestPartialPlanShape = {
      terminalNodeId: 'D',
      nodes: [
        { id: 'A', dependsOn: [], outputKind: 'image' },
        { id: 'B', dependsOn: ['A'], outputKind: 'image' },
        { id: 'C', dependsOn: ['B'], outputKind: 'image' },
        { id: 'D', dependsOn: ['C'], outputKind: 'image' },
      ],
    };
    const outcomes = new Map<string, NodeOutcome>([
      ['A', image('/run/nA.png')],
      ['B', image('/run/nB.png')],
      ['C', { status: 'error' }],
      ['D', { status: 'skipped' }],
    ]);
    expect(selectBestPartial(plan, outcomes)).toEqual({ nodeId: 'B', artifactPath: '/run/nB.png' });
  });

  it('uses terminal dependency order for same-depth image candidates', () => {
    const firstPlan: BestPartialPlanShape = {
      terminalNodeId: 'D',
      nodes: [
        { id: 'E', dependsOn: [], outputKind: 'image' },
        { id: 'F', dependsOn: [], outputKind: 'image' },
        { id: 'D', dependsOn: ['E', 'F'], outputKind: 'image' },
      ],
    };
    const secondPlan: BestPartialPlanShape = {
      ...firstPlan,
      nodes: [
        { id: 'E', dependsOn: [], outputKind: 'image' },
        { id: 'F', dependsOn: [], outputKind: 'image' },
        { id: 'D', dependsOn: ['F', 'E'], outputKind: 'image' },
      ],
    };
    const outcomes = new Map<string, NodeOutcome>([
      ['D', { status: 'error' }],
      ['E', image('/run/nE.png')],
      ['F', image('/run/nF.png')],
    ]);
    expect(selectBestPartial(firstPlan, outcomes)).toEqual({ nodeId: 'E', artifactPath: '/run/nE.png' });
    expect(selectBestPartial(secondPlan, outcomes)).toEqual({ nodeId: 'F', artifactPath: '/run/nF.png' });
  });

  it('returns null for data-only success paths', () => {
    const plan: BestPartialPlanShape = {
      terminalNodeId: 'B',
      nodes: [
        { id: 'A', dependsOn: [], outputKind: 'data' },
        { id: 'B', dependsOn: ['A'], outputKind: 'data' },
      ],
    };
    const outcomes = new Map<string, NodeOutcome>([
      ['A', { status: 'success', output: { kind: 'data', data: { type: 'dimensions' } } }],
      ['B', { status: 'success', output: { kind: 'data', data: { type: 'palette' } } }],
    ]);
    expect(selectBestPartial(plan, outcomes)).toBeNull();
  });

  it('returns null when all nodes failed', () => {
    const plan: BestPartialPlanShape = {
      terminalNodeId: 'B',
      nodes: [
        { id: 'A', dependsOn: [], outputKind: 'image' },
        { id: 'B', dependsOn: ['A'], outputKind: 'image' },
      ],
    };
    const outcomes = new Map<string, NodeOutcome>([
      ['A', { status: 'error' }],
      ['B', { status: 'error' }],
    ]);
    expect(selectBestPartial(plan, outcomes)).toBeNull();
  });

  it('ignores successful image nodes outside the terminal dependency chain', () => {
    const plan: BestPartialPlanShape = {
      terminalNodeId: 'B',
      nodes: [
        { id: 'A', dependsOn: [], outputKind: 'image' },
        { id: 'B', dependsOn: [], outputKind: 'image' },
      ],
    };
    const outcomes = new Map<string, NodeOutcome>([
      ['A', image('/run/nA.png')],
      ['B', { status: 'error' }],
    ]);
    expect(selectBestPartial(plan, outcomes)).toBeNull();
  });

  it('is deterministic across repeated calls', () => {
    const plan: BestPartialPlanShape = {
      terminalNodeId: 'D',
      nodes: [
        { id: 'A', dependsOn: [], outputKind: 'image' },
        { id: 'B', dependsOn: ['A'], outputKind: 'image' },
        { id: 'C', dependsOn: ['B'], outputKind: 'image' },
        { id: 'D', dependsOn: ['C'], outputKind: 'image' },
      ],
    };
    const outcomes = new Map<string, NodeOutcome>([
      ['A', image('/run/nA.png')],
      ['B', image('/run/nB.png')],
      ['C', { status: 'error' }],
      ['D', { status: 'skipped' }],
    ]);
    const results = Array.from({ length: 5 }, () => selectBestPartial(plan, outcomes));
    expect(results.every((result) => JSON.stringify(result) === JSON.stringify(results[0]))).toBe(true);
  });
});
