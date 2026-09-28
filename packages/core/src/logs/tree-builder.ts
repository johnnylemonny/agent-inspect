import type {
  InspectEvent,
  InspectNode,
  InspectRunTree,
  RelationshipSummary,
} from "../types/inspect-event.js";
import type { LogIngestConfig } from "../types/log-config.js";

export interface TreeBuilderOptions {
  config?: LogIngestConfig;
}

function inc<T extends string>(map: Record<T, number>, key: T): void {
  map[key] = (map[key] ?? 0) + 1;
}

function confidenceRank(confidence: InspectEvent["confidence"]): number {
  switch (confidence) {
    case "unknown":
      return 0;
    case "heuristic":
      return 1;
    case "correlated":
      return 2;
    case "explicit":
      return 3;
    default:
      return 0;
  }
}

function computeRunStatus(events: InspectEvent[]): InspectRunTree["status"] {
  // Derive the run status from the RUN node lifecycle, matching
  // manualTraceEventsToRunTree and extractMetadata: a run is "running" only
  // until its RUN completion is recorded. The v0.1 bridge writes each node as a
  // "started" event (status "running") followed by a "completed" event, so a
  // finished run still carries "running" started rows; those must not force the
  // whole run back to "running". Events arrive timestamp-sorted, so the last
  // terminal RUN status wins.
  let runTerminal: "ok" | "error" | undefined;
  let sawRunEvent = false;
  for (const e of events) {
    if (e.kind !== "RUN") continue;
    sawRunEvent = true;
    if (e.status === "ok" || e.status === "error") {
      runTerminal = e.status;
    }
  }
  if (sawRunEvent) {
    return runTerminal ?? "running";
  }

  // Fallback for traces with no RUN node (e.g. log-only ingestion).
  let hasRunning = false;
  for (const e of events) {
    if (e.status === "error") return "error";
    if (e.status === "running") hasRunning = true;
  }
  return hasRunning ? "running" : "ok";
}

interface PendingEdge {
  childId: string;
  parentId: string;
  childTimestamp: number;
  childConfidence: InspectEvent["confidence"];
}

/**
 * Link children to parents without self-edges or cycles. Broken edges become roots.
 */
export function linkNodesVisibilityFirst(
  nodes: Map<string, InspectNode>,
): { roots: InspectNode[]; summary: RelationshipSummary } {
  let selfParentCount = 0;
  let unresolvedParentCount = 0;
  let normalizedEdgeCount = 0;
  let cycleCount = 0;

  const pending: PendingEdge[] = [];
  for (const node of nodes.values()) {
    const parentId = node.event.parentId;
    if (!parentId) continue;
    if (parentId === node.event.eventId) {
      selfParentCount += 1;
      normalizedEdgeCount += 1;
      continue;
    }
    if (!nodes.has(parentId)) {
      unresolvedParentCount += 1;
      continue;
    }
    pending.push({
      childId: node.event.eventId,
      parentId,
      childTimestamp: node.event.timestamp,
      childConfidence: node.event.confidence,
    });
  }

  // Prefer keeping higher-confidence / earlier edges; break the weakest last edge in a cycle.
  pending.sort((a, b) => {
    const conf = confidenceRank(b.childConfidence) - confidenceRank(a.childConfidence);
    if (conf !== 0) return conf;
    return a.childTimestamp - b.childTimestamp;
  });

  const parentOf = new Map<string, string>();
  for (const edge of pending) {
    parentOf.set(edge.childId, edge.parentId);
    // Detect if accepting this edge creates a cycle (walk from parent toward roots).
    let cursor: string | undefined = edge.parentId;
    const seen = new Set<string>([edge.childId]);
    let cyclic = false;
    while (cursor) {
      if (seen.has(cursor)) {
        cyclic = true;
        break;
      }
      seen.add(cursor);
      cursor = parentOf.get(cursor);
    }
    if (cyclic) {
      parentOf.delete(edge.childId);
      cycleCount += 1;
      normalizedEdgeCount += 1;
    }
  }

  for (const [childId, parentId] of parentOf) {
    nodes.get(parentId)!.children.push(nodes.get(childId)!);
  }

  const roots: InspectNode[] = [];
  for (const node of nodes.values()) {
    if (!parentOf.has(node.event.eventId)) {
      roots.push(node);
    }
  }

  const assignDepth = (n: InspectNode, depth: number, stack: Set<string>) => {
    if (stack.has(n.event.eventId)) return;
    n.depth = depth;
    stack.add(n.event.eventId);
    for (const c of n.children) assignDepth(c, depth + 1, stack);
    stack.delete(n.event.eventId);
  };
  for (const r of roots) assignDepth(r, 0, new Set());

  return {
    roots,
    summary: {
      rootCount: roots.length,
      selfParentCount,
      cycleCount,
      unresolvedParentCount,
      normalizedEdgeCount,
    },
  };
}

export class TreeBuilder {
  constructor(options?: TreeBuilderOptions) {
    void options?.config;
  }

  build(events: InspectEvent[]): InspectRunTree[] {
    const byRun = new Map<string, InspectEvent[]>();
    for (const e of events) {
      if (!byRun.has(e.runId)) byRun.set(e.runId, []);
      byRun.get(e.runId)!.push(e);
    }

    const out: InspectRunTree[] = [];
    for (const [runId, runEvents] of byRun.entries()) {
      const sorted = [...runEvents].sort((a, b) => a.timestamp - b.timestamp);

      const nodes = new Map<string, InspectNode>();
      for (const e of sorted) {
        nodes.set(e.eventId, { event: e, children: [], depth: 0 });
      }

      const { roots, summary } = linkNodesVisibilityFirst(nodes);

      // metadata
      const confidenceBreakdown = {
        explicit: 0,
        correlated: 0,
        heuristic: 0,
        unknown: 0,
      } as Record<InspectEvent["confidence"], number>;
      const kinds = {} as Record<InspectEvent["kind"], number>;
      for (const e of sorted) {
        inc(confidenceBreakdown, e.confidence);
        (kinds as any)[e.kind] = ((kinds as any)[e.kind] ?? 0) + 1;
      }

      const name = sorted.find((e) => e.kind === "RUN")?.name;
      const status = computeRunStatus(sorted);
      const timing = resolveRunTiming(sorted, status);

      out.push({
        runId,
        name,
        status,
        startedAt: timing.startedAt,
        endedAt: timing.endedAt,
        durationMs: timing.durationMs,
        children: roots,
        metadata: {
          totalEvents: sorted.length,
          confidenceBreakdown,
          kinds,
          relationshipSummary: summary,
        },
      });
    }

    // newest first for stable display
    out.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
    return out;
  }
}

/**
 * Prefer explicit RUN start/end/duration facts when consistent; otherwise use a
 * conservative observed interval from event timestamps. Never invent wall-clock ends.
 */
export function resolveRunTiming(
  sorted: readonly InspectEvent[],
  status: InspectRunTree["status"],
): { startedAt?: number; endedAt?: number; durationMs?: number } {
  let startedAtMs: number | undefined;
  let endedAtMs: number | undefined;
  let explicitDurationMs: number | undefined;

  for (const event of sorted) {
    if (event.kind !== "RUN") continue;
    const attrs = event.attributes ?? {};
    if (
      typeof attrs.startedAtMs === "number" &&
      Number.isFinite(attrs.startedAtMs)
    ) {
      startedAtMs =
        startedAtMs === undefined
          ? attrs.startedAtMs
          : Math.min(startedAtMs, attrs.startedAtMs);
    }
    if (
      typeof attrs.endedAtMs === "number" &&
      Number.isFinite(attrs.endedAtMs)
    ) {
      endedAtMs =
        endedAtMs === undefined
          ? attrs.endedAtMs
          : Math.max(endedAtMs, attrs.endedAtMs);
    }
    if (
      (event.status === "ok" || event.status === "error") &&
      typeof event.durationMs === "number" &&
      Number.isFinite(event.durationMs) &&
      event.durationMs >= 0
    ) {
      explicitDurationMs = event.durationMs;
      // Completion rows often keep the start timestamp; recover end from duration.
      if (endedAtMs === undefined && startedAtMs !== undefined) {
        endedAtMs = startedAtMs + event.durationMs;
      } else if (
        endedAtMs === undefined &&
        Number.isFinite(event.timestamp)
      ) {
        endedAtMs = event.timestamp + event.durationMs;
        if (startedAtMs === undefined) {
          startedAtMs = event.timestamp;
        }
      }
    }
    if (
      startedAtMs === undefined &&
      event.status === "running" &&
      Number.isFinite(event.timestamp)
    ) {
      startedAtMs = event.timestamp;
    }
  }

  if (
    startedAtMs !== undefined &&
    endedAtMs !== undefined &&
    Number.isFinite(startedAtMs) &&
    Number.isFinite(endedAtMs) &&
    endedAtMs >= startedAtMs &&
    status !== "running"
  ) {
    return {
      startedAt: startedAtMs,
      endedAt: endedAtMs,
      durationMs: endedAtMs - startedAtMs,
    };
  }

  if (
    startedAtMs !== undefined &&
    explicitDurationMs !== undefined &&
    status !== "running"
  ) {
    return {
      startedAt: startedAtMs,
      endedAt: startedAtMs + explicitDurationMs,
      durationMs: explicitDurationMs,
    };
  }

  // Conservative observed interval from event timestamps (no wall-clock invention).
  const startedAt = sorted.length > 0 ? sorted[0]!.timestamp : undefined;
  const endedAt = sorted.length > 0 ? sorted[sorted.length - 1]!.timestamp : undefined;
  const durationMs =
    startedAt !== undefined &&
    endedAt !== undefined &&
    Number.isFinite(startedAt) &&
    Number.isFinite(endedAt) &&
    endedAt >= startedAt &&
    status !== "running"
      ? endedAt - startedAt
      : undefined;

  return {
    startedAt,
    endedAt: status === "running" ? undefined : endedAt,
    durationMs,
  };
}
