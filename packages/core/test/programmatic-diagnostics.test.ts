import { describe, expect, it } from "vitest";

import {
  PROGRAMMATIC_DIAGNOSTIC_SPECS,
  formatProgrammaticDiagnostic,
  type ProgrammaticDiagnosticCode,
} from "../src/diagnostics/programmatic.js";
import { TraceReadError, readTrace } from "../src/readers/index.js";
import { createStructureCycleRule, projectLogicalEvents, runTraceChecks } from "../src/checks/index.js";
import type { PersistedInspectEvent } from "../src/types/persisted-inspect-event.js";
import type { TraceReadResult } from "../src/readers/index.js";
import type { InspectNode, InspectRunTree } from "../src/types/inspect-event.js";

const REQUIRED: ProgrammaticDiagnosticCode[] = [
  "AI_TRACE_INPUT_INVALID",
  "AI_TRACE_FORMAT_UNSUPPORTED",
  "AI_TRACE_FORMAT_AMBIGUOUS",
  "AI_TRACE_FACTS_INPUT_NOT_NORMALIZED",
  "AI_TRACE_CONTRACT_RUN_SELECTION_REQUIRED",
  "AI_TRACE_RELATIONSHIP_SELF_PARENT",
  "AI_TRACE_RELATIONSHIP_CYCLE",
  "AI_TRACE_CONTRACT_INPUT_INVALID",
  "AI_INSPECT_RUN_UNSUPPORTED_OPTION",
];

function persisted(
  eventId: string,
  overrides: Partial<PersistedInspectEvent> = {},
): PersistedInspectEvent {
  return {
    schemaVersion: "0.2",
    eventId,
    runId: "run-diag",
    kind: "LOGIC",
    name: eventId,
    status: "ok",
    timestamp: "2026-08-08T00:00:01.000Z",
    confidence: "explicit",
    source: { type: "manual" },
    ...overrides,
  };
}

function readResult(events: PersistedInspectEvent[]): TraceReadResult {
  const children: InspectNode[] = events.map((event) => ({
    event: {
      eventId: event.eventId,
      runId: event.runId,
      parentId: event.parentId,
      kind: event.kind,
      name: event.name,
      status: "ok",
      timestamp: Date.parse(event.timestamp),
      confidence: event.confidence,
      source: { type: "manual" as const },
    },
    children: [],
    depth: 0,
  }));
  const run: InspectRunTree = {
    runId: "run-diag",
    name: "diag",
    status: "ok",
    children,
    metadata: {
      totalEvents: children.length,
      confidenceBreakdown: {
        explicit: children.length,
        correlated: 0,
        heuristic: 0,
        unknown: 0,
      },
      kinds: {
        RUN: 0,
        AGENT: 0,
        LLM: 0,
        TOOL: 0,
        CHAIN: 0,
        RETRIEVER: 0,
        DECISION: 0,
        RESULT: 0,
        ERROR: 0,
        LOGIC: children.length,
        LOG: 0,
        OUTCOME: 0,
      },
    },
  };
  return {
    format: "agent-inspect-jsonl",
    events,
    runs: [run],
    warnings: [],
    unsupportedFields: [],
    sourceFiles: [],
  };
}

describe("6.15-7 programmatic diagnostic contract", () => {
  it("catalogs every roadmap AI_* code with remediation", () => {
    for (const code of REQUIRED) {
      const spec = PROGRAMMATIC_DIAGNOSTIC_SPECS[code];
      expect(spec.code).toBe(code);
      expect(spec.remediation.length).toBeGreaterThan(0);
      const formatted = formatProgrammaticDiagnostic(code);
      expect(formatted.startsWith(`${code}:`)).toBe(true);
      expect(formatted).toContain("Remediation:");
    }
  });

  it("keeps lowercase TraceReadError codes while prefixing AI_TRACE_FORMAT_*", async () => {
    await expect(readTrace({ type: "string", content: "not-a-trace" })).rejects.toMatchObject({
      name: "TraceReadError",
      code: "unsupported_format",
      message: expect.stringContaining("AI_TRACE_FORMAT_UNSUPPORTED"),
    });
    await expect(readTrace({ type: "string", content: "not-a-trace" })).rejects.toBeInstanceOf(
      TraceReadError,
    );
  });

  it("annotates cycle findings and self-parent projection with relationship codes", () => {
    const a = persisted("a", { parentId: "b" });
    const b = persisted("b", { parentId: "a" });
    const cycle = runTraceChecks(
      { read: readResult([a, b]) },
      { rules: [createStructureCycleRule()] },
    );
    expect(
      cycle.findings.some(
        (f) =>
          f.ruleId === "structure.cycle" &&
          f.message.includes("AI_TRACE_RELATIONSHIP_CYCLE") &&
          f.message.includes("Remediation:"),
      ),
    ).toBe(true);

    const self = persisted("self", { parentId: "self" });
    const projection = projectLogicalEvents([self]);
    expect(
      projection.diagnostics.some(
        (d) =>
          d.code === "AI_LOGICAL_SELF_PARENT_REMOVED" &&
          d.message.includes("AI_TRACE_RELATIONSHIP_SELF_PARENT"),
      ),
    ).toBe(true);
  });
});
