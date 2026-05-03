import type { NodeOutput } from './ref-resolver.js';

export interface NodeOutcome {
  status: 'success' | 'error' | 'skipped';
  output?: NodeOutput;
}

export interface BestPartialPlanShape {
  terminalNodeId: string;
  nodes: Array<{ id: string; dependsOn: string[]; outputKind: 'image' | 'data' }>;
}

export function selectBestPartial(
  plan: BestPartialPlanShape,
  nodeOutcomes: Map<string, NodeOutcome>,
): { nodeId: string; artifactPath: string } | null {
  const nodeById = new Map(plan.nodes.map((node) => [node.id, node]));
  if (!nodeById.has(plan.terminalNodeId)) {
    throw new Error(`Terminal node '${plan.terminalNodeId}' not found in plan`);
  }

  const terminalOutcome = nodeOutcomes.get(plan.terminalNodeId);
  if (terminalOutcome?.status === 'success' && terminalOutcome.output?.kind === 'image') {
    return {
      nodeId: plan.terminalNodeId,
      artifactPath: terminalOutcome.output.artifactPath,
    };
  }

  const visited = new Set<string>();
  const queue = [plan.terminalNodeId];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = nodeById.get(nodeId);
    if (!node) continue;

    const outcome = nodeOutcomes.get(nodeId);
    if (outcome?.status === 'success' && outcome.output?.kind === 'image') {
      return { nodeId, artifactPath: outcome.output.artifactPath };
    }

    queue.push(...node.dependsOn);
  }

  return null;
}
