import { describe, expect, it } from "vitest";

import {
  defineTraceContract,
  evaluateTraceContract,
} from "../../src/checks/contract.js";
import type { TraceReadResult } from "../../src/readers/index.js";
import type { InspectNode, InspectRunTree } from "../../src/types/inspect-event.js";
import type { PersistedInspectEvent } from "../../src/types/persisted-inspect-event.js";

function persisted(
  eventId: string,
  runId: string,
  overrides: Partial<PersistedInspectEvent> = {},
): PersistedInspectEvent {
  return {
    schemaVersion: "0.2",
    eventId,
    runId,
    kind: "LOGIC",
    name: eventId,
    status: "ok",
    timestamp: "2026-10-11T00:00:01.000Z",
    confidence: "explicit",
    source: { type: "manual" },
    ...overrides,
  };
}

function tool(
  eventId: string,
  runId: string,
  name: string,
  startedAt: string,
  attributes: Record<string, unknown>,
): PersistedInspectEvent {
  return persisted(eventId, runId, {
    kind: "TOOL",
    name: `tool:${name}`,
    attributes: { toolName: name, metadata: attributes },
    timestamp: startedAt,
    startedAt,
    endedAt: startedAt,
  });
}

function node(event: PersistedInspectEvent, children: InspectNode[] = []): InspectNode {
  return {
    event: {
      eventId: event.eventId,
      runId: event.runId,
      parentId: event.parentId,
      kind: event.kind,
      name: event.name,
      status: event.status === "unknown" ? undefined : event.status,
      timestamp: Date.parse(event.timestamp),
      durationMs: event.durationMs,
      attributes: event.attributes,
      confidence: event.confidence,
      source: { type: "manual" },
    },
    children,
    depth: 1,
  };
}

function readOf(events: PersistedInspectEvent[]): TraceReadResult {
  const runId = events[0]?.runId ?? "run-1";
  const children = events.filter((event) => event.kind !== "RUN").map((event) => node(event));
  const tree: InspectRunTree = {
    runId,
    name: runId,
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
        TOOL: children.filter((c) => c.event.kind === "TOOL").length,
        CHAIN: 0,
        RETRIEVER: 0,
        DECISION: 0,
        RESULT: 0,
        ERROR: 0,
        LOGIC: children.filter((c) => c.event.kind === "LOGIC").length,
        LOG: 0,
        OUTCOME: children.filter((c) => c.event.kind === "OUTCOME").length,
      },
    },
  };
  return {
    format: "agent-inspect-jsonl",
    events,
    runs: [tree],
    warnings: [],
    unsupportedFields: [],
    sourceFiles: [],
  };
}

describe("retry-safety identical redelivery", () => {
  it("passes maxAttempts:2 when the same attempt rows are redelivered identically", () => {
    const base = [
      tool("manual:run:step_started:step_a:1", "run-1", "retrieve", "2026-10-11T00:00:01.000Z", {
        operationId: "op1",
        attemptId: "a1",
        attemptNumber: 1,
      }),
      tool("manual:run:step_started:step_b:3", "run-1", "retrieve", "2026-10-11T00:00:02.000Z", {
        operationId: "op1",
        attemptId: "a2",
        attemptNumber: 2,
        retryOf: "a1",
      }),
    ];
    const redelivered = [
      tool("manual:run:step_started:step_a:7", "run-1", "retrieve", "2026-10-11T00:00:01.000Z", {
        operationId: "op1",
        attemptId: "a1",
        attemptNumber: 1,
      }),
      tool("manual:run:step_started:step_b:9", "run-1", "retrieve", "2026-10-11T00:00:02.000Z", {
        operationId: "op1",
        attemptId: "a2",
        attemptNumber: 2,
        retryOf: "a1",
      }),
    ];
    const contract = defineTraceContract({ retry: { maxAttempts: 2 } });
    const result = evaluateTraceContract(
      { read: readOf([...base, ...redelivered]) },
      contract,
    );
    expect(result.status).toBe("pass");
    expect(
      result.findings.some((f) => f.ruleId === "contract.retry.duplicate-attempt-id"),
    ).toBe(false);
  });

  it("fails when distinct executions reuse the same attemptId", () => {
    const events = [
      tool("manual:run:step_started:step_a:1", "run-1", "retrieve", "2026-10-11T00:00:01.000Z", {
        operationId: "op1",
        attemptId: "a1",
        attemptNumber: 1,
      }),
      tool("manual:run:step_started:step_c:3", "run-1", "retrieve", "2026-10-11T00:00:03.000Z", {
        operationId: "op1",
        attemptId: "a1",
        attemptNumber: 1,
      }),
    ];
    const contract = defineTraceContract({ retry: { maxAttempts: 2 } });
    const result = evaluateTraceContract({ read: readOf(events) }, contract);
    expect(result.status).toBe("fail");
    expect(
      result.findings.some((f) => f.ruleId === "contract.retry.duplicate-attempt-id"),
    ).toBe(true);
  });

  it("fails maxAttempts:1 for two logical attempts even after identical redelivery", () => {
    const base = [
      tool("manual:run:step_started:step_a:1", "run-1", "retrieve", "2026-10-11T00:00:01.000Z", {
        operationId: "op1",
        attemptId: "a1",
        attemptNumber: 1,
      }),
      tool("manual:run:step_started:step_b:3", "run-1", "retrieve", "2026-10-11T00:00:02.000Z", {
        operationId: "op1",
        attemptId: "a2",
        attemptNumber: 2,
        retryOf: "a1",
      }),
    ];
    const redelivered = base.map((event, index) => ({
      ...event,
      eventId: `${event.eventId.replace(/:\d+$/, "")}:${10 + index}`,
    }));
    const contract = defineTraceContract({ retry: { maxAttempts: 1 } });
    const result = evaluateTraceContract(
      { read: readOf([...base, ...redelivered]) },
      contract,
    );
    expect(result.status).toBe("fail");
    expect(
      result.findings.some((f) => f.ruleId === "contract.retry.max-attempts"),
    ).toBe(true);
    expect(
      result.findings.some((f) => f.ruleId === "contract.retry.duplicate-attempt-id"),
    ).toBe(false);
  });
});
