import { describe, expect, it } from "vitest";

import {
  defineTraceContract,
  evaluateTraceContract,
} from "../../src/checks/contract.js";
import { extractSessionWorkflowMetadata } from "../../src/sessions/metadata.js";
import { exportOtlpJson } from "../../src/exporters/otlp-json-exporter.js";
import { manualTraceEventsToRunTree } from "../../src/exporters/manual-trace-adapter.js";
import { openTraceText } from "../../src/readers/index.js";
import type { TraceEvent } from "../../src/types.js";

function twoAttemptSource(): TraceEvent[] {
  return [
    {
      schemaVersion: "0.1",
      event: "run_started",
      timestamp: 1,
      runId: "run_rt",
      name: "O01-roundtrip",
      startTime: 1,
    },
    {
      schemaVersion: "0.1",
      event: "step_started",
      timestamp: 10,
      runId: "run_rt",
      stepId: "a1",
      name: "retrieve_policy",
      type: "tool",
      startTime: 10,
      metadata: {
        toolName: "retrieve_policy",
        operationId: "op1",
        attemptId: "a1",
        attemptNumber: 1,
      },
    },
    {
      schemaVersion: "0.1",
      event: "step_completed",
      timestamp: 20,
      runId: "run_rt",
      stepId: "a1",
      status: "success",
      endTime: 20,
      durationMs: 10,
    },
    {
      schemaVersion: "0.1",
      event: "step_started",
      timestamp: 30,
      runId: "run_rt",
      stepId: "a2",
      name: "retrieve_policy",
      type: "tool",
      startTime: 30,
      metadata: {
        toolName: "retrieve_policy",
        operationId: "op1",
        attemptId: "a2",
        attemptNumber: 2,
        retryOf: "a1",
      },
    },
    {
      schemaVersion: "0.1",
      event: "step_completed",
      timestamp: 40,
      runId: "run_rt",
      stepId: "a2",
      status: "success",
      endTime: 40,
      durationMs: 10,
    },
    {
      schemaVersion: "0.1",
      event: "run_completed",
      timestamp: 50,
      runId: "run_rt",
      status: "success",
      endTime: 50,
      durationMs: 49,
    },
  ];
}

const maxOne = defineTraceContract({
  retry: { maxAttempts: 1 },
});

describe("OTLP identity round-trip", () => {
  it("promotes agent_inspect.* identity so maxAttempts fails equally after re-import", async () => {
    const events = twoAttemptSource();
    const tree = manualTraceEventsToRunTree(events);
    const sourceRead = await openTraceText(
      events.map((e) => JSON.stringify(e)).join("\n") + "\n",
    );
    const sourceResult = evaluateTraceContract({ read: sourceRead }, maxOne);
    expect(sourceResult.status).toBe("fail");
    expect(
      sourceResult.findings.some(
        (f) => f.ruleId === "contract.retry.max-attempts" && f.status === "fail",
      ),
    ).toBe(true);

    const otlp = exportOtlpJson(tree);
    const roundtrip = await openTraceText(otlp.content);
    expect(roundtrip.format).toBe("otlp-json");

    const tools = roundtrip.events.filter((e) => e.kind === "TOOL");
    expect(tools.length).toBe(2);
    for (const tool of tools) {
      const attrs = tool.attributes ?? {};
      expect(typeof attrs["agent_inspect.operation_id"]).toBe("string");
      const meta = extractSessionWorkflowMetadata(attrs);
      expect(meta?.operationId).toBe("op1");
      expect(typeof meta?.attemptId).toBe("string");
    }
    const second = tools.find((t) => {
      const m = extractSessionWorkflowMetadata(t.attributes ?? {});
      return m?.attemptId === "a2";
    });
    expect(second).toBeDefined();
    expect(extractSessionWorkflowMetadata(second!.attributes ?? {})?.retryOf).toBe("a1");

    const roundtripResult = evaluateTraceContract({ read: roundtrip }, maxOne);
    expect(roundtripResult.status).toBe("fail");
    expect(
      roundtripResult.findings.some(
        (f) => f.ruleId === "contract.retry.max-attempts" && f.status === "fail",
      ),
    ).toBe(true);
  });

  it("warns on camelCase vs dotted identity conflicts without overwriting", async () => {
    const otlp = {
      resourceSpans: [
        {
          resource: { attributes: [{ key: "service.name", value: { stringValue: "t" } }] },
          scopeSpans: [
            {
              scope: { name: "agent-inspect" },
              spans: [
                {
                  traceId: "a".repeat(32),
                  spanId: "b".repeat(16),
                  name: "retrieve_policy",
                  kind: 1,
                  startTimeUnixNano: "1000000000",
                  endTimeUnixNano: "2000000000",
                  attributes: [
                    { key: "agent_inspect.kind", value: { stringValue: "TOOL" } },
                    { key: "agent_inspect.run_id", value: { stringValue: "run_c" } },
                    { key: "agent_inspect.event_id", value: { stringValue: "e1" } },
                    { key: "operationId", value: { stringValue: "op-camel" } },
                    { key: "agent_inspect.operation_id", value: { stringValue: "op-dotted" } },
                    { key: "agent_inspect.attempt_id", value: { stringValue: "a1" } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const read = await openTraceText(JSON.stringify(otlp));
    const tool = read.events.find((e) => e.kind === "TOOL");
    expect(tool).toBeDefined();
    expect(tool!.attributes?.operationId).toBe("op-camel");
    expect(tool!.attributes?.["agent_inspect.operation_id"]).toBe("op-dotted");
    expect(read.warnings.some((w) => w.code === "otlp_identity_conflict")).toBe(true);
  });
});
