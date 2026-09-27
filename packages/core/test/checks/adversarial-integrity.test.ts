import { describe, expect, it } from "vitest";

import {
  createObservedOutcomeRule,
  createRunStatusRule,
  createToolOrderingRule,
  createToolUsageRule,
  defineTraceContract,
  evaluateTraceContract,
  runTraceChecks,
} from "../../src/checks/index.js";
import type { TraceReadResult } from "../../src/readers/index.js";
import type { InspectNode, InspectRunTree } from "../../src/types/inspect-event.js";
import type { PersistedInspectEvent } from "../../src/types/persisted-inspect-event.js";

function persisted(
  eventId: string,
  overrides: Partial<PersistedInspectEvent> = {},
): PersistedInspectEvent {
  return {
    schemaVersion: "0.2",
    eventId,
    runId: "run-adv",
    kind: "TOOL",
    name: eventId,
    status: "ok",
    timestamp: "2026-06-26T00:00:01.000Z",
    confidence: "explicit",
    source: { type: "manual" },
    ...overrides,
  };
}

function node(event: PersistedInspectEvent, depth = 0): InspectNode {
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
    children: [],
    depth,
  };
}

function readResult(events: PersistedInspectEvent[]): TraceReadResult {
  const children = events.map((event) => node(event, 1));
  const run: InspectRunTree = {
    runId: "run-adv",
    name: "adversarial",
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
        LOGIC: 0,
        LOG: 0,
        OUTCOME: children.filter((c) => c.event.kind === "OUTCOME").length,
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

describe("adversarial check integrity", () => {
  it("records ruleExecutions and rulesEvaluated for a passing rule", () => {
    const read = readResult([
      persisted("tool:search", { name: "tool:search", attributes: { toolName: "search" } }),
    ]);
    const result = runTraceChecks(
      { read },
      { rules: [createToolUsageRule({ required: ["search"] })] },
    );
    expect(result.status).toBe("pass");
    expect(result.summary.rulesEvaluated).toBe(1);
    expect(result.summary.rulesPassed).toBe(1);
    expect(result.summary.rulesFailed).toBe(0);
    expect(result.summary.passed).toBe(0);
    expect(result.ruleExecutions).toEqual([
      expect.objectContaining({
        ruleId: "tool.usage",
        category: "tool",
        status: "pass",
        findingCount: 0,
        runId: "run-adv",
      }),
    ]);
  });

  it("evaluates three-tool and four-tool requiredOrder with unique rule ids", () => {
    const three = defineTraceContract({
      tools: { requiredOrder: ["retrieve", "rerank", "generate"] },
    });
    const four = defineTraceContract({
      tools: { requiredOrder: ["a", "b", "c", "d"] },
    });
    const threeRead = readResult([
      persisted("t1", { name: "tool:retrieve", attributes: { toolName: "retrieve" } }),
      persisted("t2", { name: "tool:rerank", attributes: { toolName: "rerank" }, timestamp: "2026-06-26T00:00:02.000Z" }),
      persisted("t3", { name: "tool:generate", attributes: { toolName: "generate" }, timestamp: "2026-06-26T00:00:03.000Z" }),
    ]);
    const fourRead = readResult([
      persisted("a", { name: "tool:a", attributes: { toolName: "a" } }),
      persisted("b", { name: "tool:b", attributes: { toolName: "b" }, timestamp: "2026-06-26T00:00:02.000Z" }),
      persisted("c", { name: "tool:c", attributes: { toolName: "c" }, timestamp: "2026-06-26T00:00:03.000Z" }),
      persisted("d", { name: "tool:d", attributes: { toolName: "d" }, timestamp: "2026-06-26T00:00:04.000Z" }),
    ]);

    const threeResult = evaluateTraceContract({ read: threeRead }, three);
    const fourResult = evaluateTraceContract({ read: fourRead }, four);

    expect(threeResult.status).toBe("pass");
    expect(threeResult.ruleExecutions.map((item) => item.ruleId)).toEqual(
      expect.arrayContaining(["contract.tool.order.0", "contract.tool.order.1"]),
    );
    expect(new Set(threeResult.ruleExecutions.map((item) => item.ruleId)).size).toBe(
      threeResult.ruleExecutions.length,
    );
    expect(fourResult.status).toBe("pass");
    expect(fourResult.ruleExecutions.map((item) => item.ruleId)).toEqual(
      expect.arrayContaining([
        "contract.tool.order.0",
        "contract.tool.order.1",
        "contract.tool.order.2",
      ]),
    );
  });

  it("fails TraceContract requiredOrder when predecessor is missing", () => {
    const contract = defineTraceContract({
      tools: { requiredOrder: ["retrieve_policy", "send_email"] },
    });
    const read = readResult([
      persisted("email", {
        name: "tool:send_email",
        attributes: { toolName: "send_email" },
      }),
    ]);
    const result = evaluateTraceContract({ read }, contract);
    expect(result.status).toBe("fail");
    expect(result.findings.some((finding) => finding.message.includes("retrieve_policy"))).toBe(
      true,
    );
  });

  it("emits overlap warning when start order passes but intervals overlap", () => {
    const read = readResult([
      persisted("before", {
        name: "tool:retrieve_policy",
        attributes: { toolName: "retrieve_policy" },
        startedAt: "2026-06-26T00:00:00.100Z",
        endedAt: "2026-06-26T00:00:00.500Z",
        timestamp: "2026-06-26T00:00:00.100Z",
      }),
      persisted("after", {
        name: "tool:send_email",
        attributes: { toolName: "send_email" },
        startedAt: "2026-06-26T00:00:00.200Z",
        endedAt: "2026-06-26T00:00:00.300Z",
        timestamp: "2026-06-26T00:00:00.200Z",
      }),
    ]);
    const result = runTraceChecks(
      { read },
      {
        rules: [
          createToolOrderingRule({ before: "retrieve_policy", after: "send_email" }),
        ],
      },
    );
    expect(result.status).toBe("pass");
    expect(result.summary.warnings).toBeGreaterThan(0);
    expect(result.findings[0]).toMatchObject({
      status: "warning",
      severity: "warning",
    });
    expect(result.findings[0]?.actual).toMatchObject({ code: "tool.order.overlap" });
  });

  it("fails reversed order", () => {
    const read = readResult([
      persisted("after", {
        name: "tool:send_email",
        attributes: { toolName: "send_email" },
        timestamp: "2026-06-26T00:00:01.000Z",
      }),
      persisted("before", {
        name: "tool:retrieve_policy",
        attributes: { toolName: "retrieve_policy" },
        timestamp: "2026-06-26T00:00:02.000Z",
      }),
    ]);
    const result = runTraceChecks(
      { read },
      {
        rules: [
          createToolOrderingRule({ before: "retrieve_policy", after: "send_email" }),
        ],
      },
    );
    expect(result.status).toBe("fail");
  });

  it("fails unfinished forbidden tool invocations", () => {
    const read = readResult([
      persisted("email", {
        name: "tool:send_email",
        attributes: { toolName: "send_email" },
        status: "running",
      }),
    ]);
    const result = runTraceChecks(
      { read },
      {
        rules: [
          createToolUsageRule({ forbidden: ["send_email"] }),
          createRunStatusRule({ allowIncomplete: true }),
        ],
      },
    );
    expect(result.status).toBe("fail");
    expect(result.findings.some((finding) => finding.message.includes("Forbidden tool"))).toBe(
      true,
    );
  });

  it("fails unfinished tools outside the allowed list", () => {
    const read = readResult([
      persisted("email", {
        name: "tool:send_email",
        attributes: { toolName: "send_email" },
        status: "running",
      }),
    ]);
    const result = runTraceChecks(
      { read },
      { rules: [createToolUsageRule({ allowed: ["search"] })] },
    );
    expect(result.status).toBe("fail");
  });

  it("fails requireAny observation rule when no outcomes exist", () => {
    const read = readResult([
      persisted("tool:search", { name: "tool:search", attributes: { toolName: "search" } }),
    ]);
    const result = runTraceChecks(
      { read },
      { rules: [createObservedOutcomeRule({ failOn: ["failed"], requireAny: true })] },
    );
    expect(result.status).toBe("fail");
    expect(result.findings[0]?.actual).toMatchObject({ code: "outcome.missing" });
  });

  it("fails when a failed observation is present", () => {
    const read = readResult([
      persisted("out-1", {
        kind: "OUTCOME",
        name: "refund",
        status: "ok",
        attributes: {
          outcomeStatus: "failed",
          expectation: "confirmed",
        },
      }),
    ]);
    const result = runTraceChecks(
      { read },
      { rules: [createObservedOutcomeRule({ failOn: ["failed"] })] },
    );
    expect(result.status).toBe("fail");
  });

  it("passes when only passed observations exist and requireAny is true", () => {
    const read = readResult([
      persisted("out-1", {
        kind: "OUTCOME",
        name: "refund",
        status: "ok",
        attributes: {
          outcomeStatus: "passed",
          expectation: "confirmed",
        },
      }),
    ]);
    const result = runTraceChecks(
      { read },
      { rules: [createObservedOutcomeRule({ failOn: ["failed"], requireAny: true })] },
    );
    expect(result.status).toBe("pass");
  });

  it("keeps low-level ordering vacuous when an endpoint is missing", () => {
    const read = readResult([
      persisted("email", {
        name: "tool:send_email",
        attributes: { toolName: "send_email" },
      }),
    ]);
    const result = runTraceChecks(
      { read },
      {
        rules: [
          createToolOrderingRule({ before: "retrieve_policy", after: "send_email" }),
        ],
      },
    );
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });
});
