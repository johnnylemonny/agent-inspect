import { describe, expect, it } from "vitest";

import { mergeSafetyExtensions } from "../src/safety-extensions.js";

function baseResult() {
  return {
    ok: true,
    status: "pass" as const,
    format: "agent-inspect-jsonl" as const,
    summary: {
      passed: 1,
      failed: 0,
      warnings: 0,
      errors: 0,
      rulesEvaluated: 1,
      rulesPassed: 1,
      rulesWarning: 0,
      rulesFailed: 0,
      rulesError: 0,
    },
    findings: [],
    diagnostics: [],
    ruleExecutions: [
      {
        ruleId: "structure.relationship",
        category: "structure" as const,
        status: "pass" as const,
        findingCount: 0,
      },
    ],
  };
}

function toolPair(runId: string, index: number, toolName = "retrieve_policy") {
  const stepId = `step-${runId}-${index}`;
  const startId = `start-${runId}-${index}`;
  const endId = `end-${runId}-${index}`;
  return [
    {
      schemaVersion: "0.2" as const,
      eventId: startId,
      runId,
      kind: "TOOL" as const,
      name: toolName,
      status: "running" as const,
      timestamp: `2026-09-18T00:00:${String(index).padStart(2, "0")}.000Z`,
      confidence: "explicit" as const,
      source: { type: "manual" as const },
      attributes: {
        legacyEvent: "step_started",
        stepId,
        stepType: "tool",
        toolName,
      },
    },
    {
      schemaVersion: "0.2" as const,
      eventId: endId,
      runId,
      kind: "TOOL" as const,
      name: toolName,
      status: "ok" as const,
      timestamp: `2026-09-18T00:00:${String(index).padStart(2, "0")}.500Z`,
      confidence: "explicit" as const,
      source: { type: "manual" as const },
      attributes: {
        legacyEvent: "step_completed",
        stepId,
        stepType: "tool",
        toolName,
      },
    },
  ];
}

describe("safety-extensions", () => {
  it("merges circuit findings into check results", () => {
    const read = {
      format: "agent-inspect-jsonl",
      events: Array.from({ length: 5 }, (_, index) => ({
        schemaVersion: "0.2",
        eventId: `e-${index}`,
        runId: "run-1",
        name: "tool:search",
        kind: "TOOL",
        timestamp: `2026-09-18T00:00:0${index}.000Z`,
        confidence: "explicit",
        source: { type: "manual" },
        attributes: { toolName: "search", arguments: { q: "x" } },
      })),
      runs: [],
      warnings: [],
      unsupportedFields: [],
      sourceFiles: [],
    };
    const merged = mergeSafetyExtensions(baseResult(), read as never, {
      circuits: ["same-tool-repetition"],
    });
    expect(merged.status).toBe("fail");
    expect(merged.findings.some((finding) => finding.ruleId === "circuit.same-tool-repetition")).toBe(
      true,
    );
    expect(merged.findings.find((finding) => finding.ruleId === "circuit.same-tool-repetition")?.actual).toBe(
      5,
    );
    expect(merged.ruleExecutions.map((item) => item.ruleId)).toEqual([
      "structure.relationship",
      "circuit.same-tool-repetition",
    ]);
    expect(merged.summary.rulesEvaluated).toBe(2);
    expect(
      merged.ruleExecutions.find((item) => item.ruleId === "circuit.same-tool-repetition"),
    ).toMatchObject({ status: "fail", findingCount: 1, category: "safety" });
  });

  it("counts start/complete tool pairs once via logical projection", () => {
    const events = [2, 3, 4].flatMap((n) =>
      Array.from({ length: n }, (_, i) => toolPair(`calls-${n}`, i)).flat(),
    );
    // Only evaluate the 2-call run: should pass default maxRepeats=3
    const readTwo = {
      format: "agent-inspect-jsonl",
      events: Array.from({ length: 2 }, (_, i) => toolPair("calls-2", i)).flat(),
      runs: [],
      warnings: [],
      unsupportedFields: [],
      sourceFiles: [],
    };
    const passTwo = mergeSafetyExtensions(baseResult(), readTwo as never, {
      circuits: ["same-tool-repetition"],
      runId: "calls-2",
    });
    expect(passTwo.status).toBe("pass");

    const readFour = {
      format: "agent-inspect-jsonl",
      events: Array.from({ length: 4 }, (_, i) => toolPair("calls-4", i)).flat(),
      runs: [],
      warnings: [],
      unsupportedFields: [],
      sourceFiles: [],
    };
    const failFour = mergeSafetyExtensions(baseResult(), readFour as never, {
      circuits: ["same-tool-repetition"],
      runId: "calls-4",
    });
    expect(failFour.status).toBe("fail");
    expect(
      failFour.findings.find((finding) => finding.ruleId === "circuit.same-tool-repetition")?.actual,
    ).toBe(4);

    // Multi-run file: selecting the 1-call run must not include the 4-call run
    const mixed = {
      format: "agent-inspect-jsonl",
      events: [
        ...Array.from({ length: 1 }, (_, i) => toolPair("calls-1", i)).flat(),
        ...Array.from({ length: 4 }, (_, i) => toolPair("calls-4", i)).flat(),
      ],
      runs: [],
      warnings: [],
      unsupportedFields: [],
      sourceFiles: [],
    };
    void events;
    const scoped = mergeSafetyExtensions(baseResult(), mixed as never, {
      circuits: ["same-tool-repetition"],
      runId: "calls-1",
    });
    expect(scoped.status).toBe("pass");
  });

  it("counts bare TOOL kind names toward repetition", () => {
    const read = {
      format: "agent-inspect-jsonl",
      events: Array.from({ length: 4 }, (_, index) => ({
        schemaVersion: "0.2",
        eventId: `bare-${index}`,
        runId: "bare",
        kind: "TOOL",
        name: "retrieve_policy",
        timestamp: `2026-09-18T00:00:0${index}.000Z`,
        confidence: "explicit",
        source: { type: "manual" },
        attributes: { toolName: "retrieve_policy" },
      })),
      runs: [],
      warnings: [],
      unsupportedFields: [],
      sourceFiles: [],
    };
    const merged = mergeSafetyExtensions(baseResult(), read as never, {
      circuits: ["same-tool-repetition"],
    });
    expect(merged.status).toBe("fail");
    expect(
      merged.findings.find((finding) => finding.ruleId === "circuit.same-tool-repetition")?.actual,
    ).toBe(4);
  });

  it("records passing circuit selections in ruleExecutions", () => {
    const read = {
      format: "agent-inspect-jsonl",
      events: Array.from({ length: 1 }, (_, i) => toolPair("pass-1", i)).flat(),
      runs: [],
      warnings: [],
      unsupportedFields: [],
      sourceFiles: [],
    };
    const merged = mergeSafetyExtensions(baseResult(), read as never, {
      circuits: ["same-tool-repetition"],
      runId: "pass-1",
    });
    expect(merged.status).toBe("pass");
    expect(merged.summary.rulesEvaluated).toBe(2);
    expect(
      merged.ruleExecutions.find((item) => item.ruleId === "circuit.same-tool-repetition"),
    ).toMatchObject({ status: "pass", findingCount: 1, runId: "pass-1" });
  });

  it("accounts for selected guardrails without applicable input", () => {
    const read = {
      format: "agent-inspect-jsonl",
      events: [
        {
          schemaVersion: "0.2",
          eventId: "run-only",
          runId: "empty-inputs",
          kind: "RUN",
          name: "agent",
          timestamp: "2026-09-18T00:00:00.000Z",
          confidence: "explicit",
          source: { type: "manual" },
          attributes: {},
        },
      ],
      runs: [],
      warnings: [],
      unsupportedFields: [],
      sourceFiles: [],
    };
    const merged = mergeSafetyExtensions(baseResult(), read as never, {
      guardrails: ["banned-phrase"],
      runId: "empty-inputs",
    });
    expect(merged.status).toBe("pass");
    expect(
      merged.ruleExecutions.find((item) => item.ruleId === "guardrail.banned-phrase"),
    ).toMatchObject({ status: "pass", findingCount: 0, runId: "empty-inputs" });
    expect(merged.summary.rulesEvaluated).toBe(2);
  });

  it("fails closed on unknown circuit rule names instead of silent green", () => {
    const read = {
      format: "agent-inspect-jsonl",
      events: Array.from({ length: 1 }, (_, i) => toolPair("unk", i)).flat(),
      runs: [],
      warnings: [],
      unsupportedFields: [],
      sourceFiles: [],
    };
    const merged = mergeSafetyExtensions(baseResult(), read as never, {
      circuits: ["not-a-real-circuit"],
    });
    expect(merged.status).toBe("error");
    expect(merged.ok).toBe(false);
    expect(merged.findings.some((finding) => finding.ruleId === "not-a-real-circuit")).toBe(true);
    expect(
      merged.ruleExecutions.find((item) => item.ruleId === "not-a-real-circuit"),
    ).toMatchObject({ status: "error", findingCount: 1 });
  });
});
