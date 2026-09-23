import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { TraceEvent } from "../src/types.js";
import { buildRunTimeline, renderTimeline } from "../src/timeline.js";

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/traces",
);

async function loadFixture(name: string) {
  const raw = await readFile(path.join(fixturesDir, name), "utf-8");
  return raw
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l));
}

function stepStarted(stepId: string, parentId?: string): TraceEvent {
  const timestamp = 1_700_000_000_000;
  return {
    schemaVersion: "0.1",
    event: "step_started",
    timestamp,
    runId: "run_timeline",
    stepId,
    name: stepId,
    type: "logic",
    startTime: timestamp,
    ...(parentId !== undefined ? { parentId } : {}),
  };
}

function depthsByStepId(events: readonly TraceEvent[]): Record<string, number> {
  return Object.fromEntries(
    buildRunTimeline(events).entries.map((entry) => [
      entry.stepId,
      entry.depth,
    ]),
  );
}

describe("buildRunTimeline", () => {
  it("orders steps chronologically", async () => {
    const events = await loadFixture("minimal-success.jsonl");
    const timeline = buildRunTimeline(events);
    expect(timeline.entries).toHaveLength(1);
    expect(timeline.entries[0]?.name).toBe("plan");
    expect(timeline.entries[0]?.offsetMs).toBe(10);
    expect(timeline.entries[0]?.durationMs).toBe(100);
  });

  it("detects error steps", async () => {
    const events = await loadFixture("minimal-error.jsonl");
    const timeline = buildRunTimeline(events);
    expect(timeline.status).toBe("error");
    expect(timeline.entries[0]?.isError).toBe(true);
  });

  it("marks tool and llm step types", async () => {
    const events = await loadFixture("tool-with-io.jsonl");
    const timeline = buildRunTimeline(events);
    expect(timeline.entries[0]?.type).toBe("tool");
  });

  it("marks slow focus on longest steps", async () => {
    const events = await loadFixture("tool-with-io.jsonl");
    const timeline = buildRunTimeline(events, { focus: "slow", slowTopN: 1 });
    expect(timeline.entries[0]?.slow).toBe(true);
    const text = renderTimeline(timeline, { focus: "slow" });
    expect(text).toContain("[slow]");
  });

  it("includes streaming metadata when present", async () => {
    const events = await loadFixture("minimal-success.jsonl");
    (events[1] as { metadata?: Record<string, unknown> }).metadata = {
      chunkCount: 3,
      streamDurationMs: 120,
    };
    const timeline = buildRunTimeline(events);
    expect(timeline.entries[0]?.streaming?.chunkCount).toBe(3);
  });

  it("handles missing optional fields", async () => {
    const timeline = buildRunTimeline([]);
    expect(timeline.runId).toBe("unknown-run");
    expect(timeline.entries).toEqual([]);
  });

  it("preserves valid ancestry depths", () => {
    const depths = depthsByStepId([
      stepStarted("grandchild", "child"),
      stepStarted("child", "root"),
      stepStarted("root"),
    ]);

    expect(depths).toEqual({
      grandchild: 2,
      child: 1,
      root: 0,
    });
  });

  it("handles self-parent cycles without overflowing", () => {
    expect(depthsByStepId([stepStarted("cycle", "cycle")])).toEqual({
      cycle: 0,
    });
  });

  it("preserves descendant depth above a cyclic ancestry boundary", () => {
    const depths = depthsByStepId([
      stepStarted("cycle-a", "cycle-b"),
      stepStarted("cycle-b", "cycle-a"),
      stepStarted("child", "cycle-a"),
      stepStarted("grandchild", "child"),
    ]);

    expect(depths).toEqual({
      "cycle-a": 0,
      "cycle-b": 0,
      child: 1,
      grandchild: 2,
    });
  });

  it("preserves a valid prefix above a mid-chain self-cycle", () => {
    const depths = depthsByStepId([
      stepStarted("child", "cycle"),
      stepStarted("cycle", "cycle"),
    ]);

    expect(depths).toEqual({
      child: 1,
      cycle: 0,
    });
  });

  it.each([
    ["missing", undefined],
    ["blank", "   "],
    ["unknown", "missing-step"],
  ])("keeps %s parents at the root depth boundary", (_case, parentId) => {
    expect(depthsByStepId([stepStarted("root", parentId)])).toEqual({
      root: 0,
    });
  });

  it("preserves the depth cap for very deep ancestry", () => {
    const deepestDepth = 10_000;
    const steps = Array.from({ length: deepestDepth + 1 }, (_, index) => {
      const depth = deepestDepth - index;
      return stepStarted(
        `step-${depth}`,
        depth === 0 ? undefined : `step-${depth - 1}`,
      );
    });

    const depths = depthsByStepId(steps);

    expect(depths["step-0"]).toBe(0);
    expect(depths[`step-${deepestDepth}`]).toBe(1000);
  });
});
