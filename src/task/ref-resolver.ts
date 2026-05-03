export type NodeOutput =
  | { kind: 'image'; artifactPath: string }
  | { kind: 'data'; data: unknown };

export interface ResolveCtx {
  inputs: Record<string, string>;
  nodeOutputs: Record<string, NodeOutput>;
}

const INPUT_REF_RE = /^\$inputs\.([A-Za-z_][A-Za-z0-9_]*)$/;
const NODE_REF_RE = /^\$nodes\.([A-Za-z_][A-Za-z0-9_]*)\.output$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

export function resolveRefs(value: unknown, ctx: ResolveCtx): unknown {
  if (typeof value === 'string') {
    const inputMatch = INPUT_REF_RE.exec(value);
    if (inputMatch) {
      const inputName = inputMatch[1]!;
      if (!(inputName in ctx.inputs)) {
        throw new Error(`Unknown input '${inputName}'`);
      }
      return ctx.inputs[inputName];
    }

    const nodeMatch = NODE_REF_RE.exec(value);
    if (nodeMatch) {
      const nodeId = nodeMatch[1]!;
      const output = ctx.nodeOutputs[nodeId];
      if (!output) {
        throw new Error(`Cannot resolve $nodes.${nodeId}.output: node not in ctx.nodeOutputs`);
      }
      if (output.kind === 'image') {
        return output.artifactPath;
      }
      if (output.kind === 'data') {
        return output.data;
      }
      const kind = (output as { kind?: unknown }).kind;
      throw new Error(`Unrecognized node output kind for '${nodeId}': ${String(kind)}`);
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveRefs(item, ctx));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, resolveRefs(nested, ctx)]),
    );
  }

  return value;
}
