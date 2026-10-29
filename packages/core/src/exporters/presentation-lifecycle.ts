/**
 * Presentation-only lifecycle join for HTML/Markdown trees.
 * Does not mutate the input tree or original events. Nested v0.1 pairs that
 * sit on different parents still need coalesceLifecycle at tree-build time;
 * this helper joins sibling start/complete rows that share run/step identity.
 */
import type { InspectEvent, InspectNode, InspectRunTree } from "../types/inspect-event.js";

function stepIdOf(event: InspectEvent): string | undefined {
  const value = event.attributes?.stepId;
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function lifecycleKey(event: InspectEvent): string {
  if (event.kind === "RUN") return `run:${event.runId}`;
  const stepId = stepIdOf(event);
  if (stepId !== undefined) return `step:${stepId}`;
  return `event:${event.eventId}`;
}

function isTerminal(status: InspectEvent["status"]): boolean {
  return status === "ok" || status === "error";
}

function cloneNode(node: InspectNode): InspectNode {
  return {
    event: {
      ...node.event,
      ...(node.event.attributes !== undefined
        ? { attributes: { ...node.event.attributes } }
        : {}),
    },
    children: node.children.map(cloneNode),
    depth: node.depth,
  };
}

function joinSiblingGroup(group: InspectNode[]): InspectNode[] {
  if (group.length <= 1) return group;

  const terminals = group.filter((n) => isTerminal(n.event.status));
  const runnings = group.filter((n) => n.event.status === "running");
  const terminalStatuses = new Set(terminals.map((n) => n.event.status));

  // Conflicting completions stay visible as distinct physical evidence.
  if (terminalStatuses.size > 1) {
    return group;
  }

  if (terminals.length >= 1) {
    const terminal = terminals[terminals.length - 1]!;
    const start = runnings[0];
    const childMap = new Map<string, InspectNode>();
    for (const n of group) {
      for (const child of n.children) {
        childMap.set(child.event.eventId, child);
      }
    }
    return [
      {
        event: {
          ...terminal.event,
          name: start?.event.name ?? terminal.event.name,
          kind: start?.event.kind ?? terminal.event.kind,
          ...(start?.event.timestamp !== undefined &&
          terminal.event.durationMs === undefined
            ? {}
            : {}),
        },
        children: presentSiblingNodes([...childMap.values()]),
        depth: terminal.depth,
      },
    ];
  }

  // Missing completion: keep running/unknown rows.
  return group;
}

function presentSiblingNodes(nodes: InspectNode[]): InspectNode[] {
  const prepared = nodes.map((n) => ({
    ...cloneNode(n),
    children: presentSiblingNodes(n.children),
  }));

  const order: string[] = [];
  const groups = new Map<string, InspectNode[]>();
  for (const node of prepared) {
    const key = lifecycleKey(node.event);
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(node);
  }

  const out: InspectNode[] = [];
  for (const key of order) {
    out.push(...joinSiblingGroup(groups.get(key)!));
  }
  return out;
}

/**
 * Clone a run tree for display so completed start/complete sibling pairs show
 * one joined status. Original events remain untouched.
 */
export function presentLifecycleJoinedTree(tree: InspectRunTree): InspectRunTree {
  return {
    ...tree,
    children: presentSiblingNodes(tree.children),
    metadata: {
      ...tree.metadata,
      confidenceBreakdown: { ...tree.metadata.confidenceBreakdown },
      kinds: { ...tree.metadata.kinds },
      ...(tree.metadata.relationshipSummary !== undefined
        ? { relationshipSummary: { ...tree.metadata.relationshipSummary } }
        : {}),
    },
  };
}
