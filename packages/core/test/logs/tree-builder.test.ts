import { describe, expect, it } from "vitest";

import { TreeBuilder } from "../../src/logs/tree-builder.js";
import type { InspectEvent } from "../../src/types/inspect-event.js";

function e(partial: Partial<InspectEvent> & Pick<InspectEvent, "eventId" | "runId" | "name" | "kind" | "timestamp" | "confidence" | "source">): InspectEvent {
  return {
    status: undefined,
    durationMs: undefined,
    attributes: undefined,
    parentId: undefined,
    ...partial,
  };
}

describe("TreeBuilder", () => {
  it("groups by runId and sorts by timestamp", () => {
    const b = new TreeBuilder();
    const events: InspectEvent[] = [
      e({ eventId: "2", runId: "r", name: "b", kind: "LOG", timestamp: 2, confidence: "correlated", source: { type: "json-log" } }),
      e({ eventId: "1", runId: "r", name: "a", kind: "LOG", timestamp: 1, confidence: "correlated", source: { type: "json-log" } }),
    ];
    const trees = b.build(events);
    expect(trees).toHaveLength(1);
    expect(trees[0]!.children[0]!.event.name).toBe("a");
  });

  it("nests only with explicit parentId", () => {
    const b = new TreeBuilder();
    const parent = e({ eventId: "p", runId: "r", name: "p", kind: "AGENT", timestamp: 1, confidence: "explicit", source: { type: "json-log" } });
    const child = e({ eventId: "c", runId: "r", parentId: "p", name: "c", kind: "TOOL", timestamp: 2, confidence: "explicit", source: { type: "json-log" } });
    const trees = b.build([child, parent]);
    expect(trees[0]!.children).toHaveLength(1);
    expect(trees[0]!.children[0]!.children[0]!.event.name).toBe("c");
  });

  it("unresolved parent stays at root", () => {
    const b = new TreeBuilder();
    const child = e({ eventId: "c", runId: "r", parentId: "missing", name: "c", kind: "TOOL", timestamp: 1, confidence: "explicit", source: { type: "json-log" } });
    const trees = b.build([child]);
    expect(trees[0]!.children).toHaveLength(1);
  });

  it("treats self-parent as a visible root (N-4)", () => {
    const b = new TreeBuilder();
    const self = e({
      eventId: "s",
      runId: "r",
      parentId: "s",
      name: "seq",
      kind: "CHAIN",
      timestamp: 1,
      confidence: "explicit",
      source: { type: "json-log" },
    });
    const nested = e({
      eventId: "n",
      runId: "r",
      parentId: "s",
      name: "llm",
      kind: "LLM",
      timestamp: 2,
      confidence: "explicit",
      source: { type: "json-log" },
    });
    const trees = b.build([self, nested]);
    expect(trees[0]!.children.map((n) => n.event.eventId).sort()).toEqual(["s"]);
    expect(trees[0]!.children[0]!.children[0]!.event.eventId).toBe("n");
    expect(trees[0]!.metadata.relationshipSummary?.selfParentCount).toBe(1);
  });

  it("breaks cycles and keeps all nodes visible", () => {
    const b = new TreeBuilder();
    const a = e({
      eventId: "a",
      runId: "r",
      parentId: "c",
      name: "a",
      kind: "LOGIC",
      timestamp: 1,
      confidence: "explicit",
      source: { type: "json-log" },
    });
    const bNode = e({
      eventId: "b",
      runId: "r",
      parentId: "a",
      name: "b",
      kind: "LOGIC",
      timestamp: 2,
      confidence: "heuristic",
      source: { type: "json-log" },
    });
    const c = e({
      eventId: "c",
      runId: "r",
      parentId: "b",
      name: "c",
      kind: "LOGIC",
      timestamp: 3,
      confidence: "unknown",
      source: { type: "json-log" },
    });
    const trees = b.build([a, bNode, c]);
    const ids = new Set<string>();
    const walk = (nodes: typeof trees[0]["children"]) => {
      for (const n of nodes) {
        ids.add(n.event.eventId);
        walk(n.children);
      }
    };
    walk(trees[0]!.children);
    expect([...ids].sort()).toEqual(["a", "b", "c"]);
    expect(trees[0]!.metadata.relationshipSummary?.cycleCount).toBeGreaterThan(0);
  });

  it("prefers explicit RUN start/end/duration facts over event-timestamp span", () => {
    const b = new TreeBuilder();
    const start = e({
      eventId: "run_start",
      runId: "r",
      name: "demo",
      kind: "RUN",
      timestamp: 1_000,
      status: "running",
      confidence: "explicit",
      source: { type: "manual" },
      attributes: { startedAtMs: 1_000 },
    });
    const done = e({
      eventId: "run_done",
      runId: "r",
      name: "demo",
      kind: "RUN",
      timestamp: 1_000,
      status: "ok",
      durationMs: 1_000,
      confidence: "explicit",
      source: { type: "manual" },
      attributes: { startedAtMs: 1_000, endedAtMs: 2_000 },
    });
    const trees = b.build([start, done]);
    expect(trees[0]!.startedAt).toBe(1_000);
    expect(trees[0]!.endedAt).toBe(2_000);
    expect(trees[0]!.durationMs).toBe(1_000);
  });

  it("recovers duration from RUN durationMs when end timestamp equals start", () => {
    const b = new TreeBuilder();
    const done = e({
      eventId: "run_done",
      runId: "r",
      name: "solo",
      kind: "RUN",
      timestamp: 5_000,
      status: "ok",
      durationMs: 1_000,
      confidence: "explicit",
      source: { type: "manual" },
      attributes: { startedAtMs: 5_000 },
    });
    const trees = b.build([done]);
    expect(trees[0]!.durationMs).toBe(1_000);
    expect(trees[0]!.endedAt).toBe(6_000);
  });
});

