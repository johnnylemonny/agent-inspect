/**
 * #491 — one contract accepting legitimate variation (Shola + Anitesh).
 * Presence/order/forbidden + retry ceiling + explicit successful-result dependency.
 */
import path from "node:path";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";

import { inspectRun, step } from "agent-inspect";
import {
  defineTraceContract,
  evaluateTraceContractRead,
  projectLogicalEvents,
} from "agent-inspect/checks";
import { openTraceFile } from "agent-inspect/readers";

const silent = process.env.AGENT_INSPECT_SILENT === "true";
const baseDir = path.join(process.cwd(), ".agent-inspect-runs");

const contract = defineTraceContract({
  run: { requireCompleted: true, allowedStatuses: ["ok"] },
  tools: {
    required: ["lookup"],
    forbidden: ["refund"],
  },
  steps: {
    orderRelations: [
      {
        before: { kind: "TOOL", name: "lookup" },
        after: { kind: "LLM", name: "answer" },
        mode: "first-occurrence",
      },
    ],
  },
  retry: {
    operations: [
      {
        tool: "lookup",
        maxAttempts: 2,
        sideEffectClass: "read",
        requireRecoveredFailureVisible: true,
        successfulResultDependency: {
          consumerKind: "LLM",
          requireExplicitReference: true,
        },
      },
    ],
  },
});

type CaseResult = {
  id: string;
  expected: "pass" | "fail";
  observed: string;
  ruleIds?: string[];
};
const results: CaseResult[] = [];

async function capture(id: string, fn: () => Promise<void>): Promise<string> {
  const traceDir = path.join(baseDir, id);
  rmSync(traceDir, { recursive: true, force: true });
  mkdirSync(traceDir, { recursive: true });
  await inspectRun(id, fn, { silent, traceDir });
  const files = readdirSync(traceDir).filter((f) => f.endsWith(".jsonl"));
  if (!files[0]) throw new Error(`no trace for ${id}`);
  return path.join(traceDir, files[0]);
}

async function evalLive(
  id: string,
  expected: "pass" | "fail",
  fn: () => Promise<void>,
) {
  const tracePath = await capture(id, fn);
  const read = await openTraceFile(tracePath);
  const out = evaluateTraceContractRead(read, contract);
  const ruleIds = out.findings.map((f) => f.ruleId);
  results.push({ id, expected, observed: out.status, ruleIds });
  console.log(`  ${id}: expected=${expected} observed=${out.status}`);
}

async function lookupOk(toolCallId: string, attemptId = "a1", attemptNumber = 1, retryOf?: string) {
  await step(
    "lookup",
    async () => ({ policy: "ok", toolCallId }),
    {
      type: "tool",
      metadata: {
        toolName: "lookup",
        operationId: "op_lookup",
        attemptId,
        attemptNumber,
        toolCallId,
        ...(retryOf ? { retryOf } : {}),
      },
    },
  );
}

async function answerConsuming(toolCallId: string) {
  // Explicit consumption: LLM workflow toolCallId matches successful tool's toolCallId.
  await step(
    "answer",
    async () => "done",
    {
      type: "llm",
      metadata: {
        model: "answer",
        toolCallId,
      },
    },
  );
}

console.log("valid-variable-paths:");

await evalLive("V01-lookup-answer", "pass", async () => {
  await lookupOk("tc-v01");
  await answerConsuming("tc-v01");
});

await evalLive("V02-optional-format", "pass", async () => {
  await lookupOk("tc-v02");
  await step("format_optional", async () => "fmt");
  await answerConsuming("tc-v02");
});

await evalLive("V03-prohibited-refund", "fail", async () => {
  await lookupOk("tc-v03");
  await step.tool("refund", async () => ({ ok: true }));
  await answerConsuming("tc-v03");
});

await evalLive("V04-missing-lookup", "fail", async () => {
  await answerConsuming("tc-missing");
});

await evalLive("V05-future-result-ref", "fail", async () => {
  // Answer before lookup — order + dependency chronology fail closed.
  await answerConsuming("tc-v05");
  await lookupOk("tc-v05");
});

await evalLive("V06-retry-ok", "pass", async () => {
  try {
    await step(
      "lookup",
      async () => {
        const err = new Error("transient lookup");
        (err as Error & { code?: string }).code = "ETIMEDOUT";
        throw err;
      },
      {
        type: "tool",
        metadata: {
          toolName: "lookup",
          operationId: "op_lookup",
          attemptId: "a1",
          attemptNumber: 1,
          toolCallId: "tc-a1",
        },
      },
    );
  } catch {
    /* allowlisted failed-then-success */
  }
  await lookupOk("tc-a2", "a2", 2, "a1");
  await answerConsuming("tc-a2");
});

await evalLive("V06-retry-excess", "fail", async () => {
  try {
    await step(
      "lookup",
      async () => {
        throw Object.assign(new Error("t1"), { code: "ETIMEDOUT" });
      },
      {
        type: "tool",
        metadata: {
          toolName: "lookup",
          operationId: "op_lookup",
          attemptId: "a1",
          attemptNumber: 1,
          toolCallId: "tc-x1",
        },
      },
    );
  } catch {
    /* */
  }
  try {
    await step(
      "lookup",
      async () => {
        throw Object.assign(new Error("t2"), { code: "ETIMEDOUT" });
      },
      {
        type: "tool",
        metadata: {
          toolName: "lookup",
          operationId: "op_lookup",
          attemptId: "a2",
          attemptNumber: 2,
          retryOf: "a1",
          toolCallId: "tc-x2",
        },
      },
    );
  } catch {
    /* */
  }
  await lookupOk("tc-x3", "a3", 3, "a2");
  await answerConsuming("tc-x3");
});

await evalLive("V07-wrong-result-ref", "fail", async () => {
  await lookupOk("tc-real");
  await answerConsuming("tc-WRONG");
});

await evalLive("V08-missing-result-ref", "fail", async () => {
  await lookupOk("tc-real");
  await step.llm("answer", async () => "done");
});

/**
 * Anitesh — seven **logical** normalized events with valid lifecycle pairs.
 * Physical JSONL rows may exceed seven; do not pad junk rows to hit seven.
 *
 * Logical (safe): RUN, TOOL prepare, TOOL lookup, LOGIC format_optional,
 * LLM answer, TOOL audit_note, LOGIC finalize.
 */
function sevenLogicalJsonl(broken: boolean): string {
  const runId = broken ? "run_a7_broken" : "run_a7_safe";
  const safe = [
    { event: "run_started", name: "seven-meta", startTime: 1 },
    { event: "step_started", stepId: "p1", type: "tool", name: "prepare", startTime: 2 },
    { event: "step_completed", stepId: "p1", status: "success", endTime: 3, durationMs: 1 },
    { event: "step_started", stepId: "t1", type: "tool", name: "lookup", startTime: 4 },
    { event: "step_completed", stepId: "t1", status: "success", endTime: 5, durationMs: 1 },
    {
      event: "step_started",
      stepId: "fmt1",
      type: "logic",
      name: "format_optional",
      startTime: 6,
    },
    {
      event: "step_completed",
      stepId: "fmt1",
      status: "success",
      endTime: 7,
      durationMs: 1,
    },
    { event: "step_started", stepId: "l1", type: "llm", name: "answer", startTime: 8 },
    { event: "step_completed", stepId: "l1", status: "success", endTime: 9, durationMs: 1 },
    { event: "step_started", stepId: "a1", type: "tool", name: "audit_note", startTime: 10 },
    { event: "step_completed", stepId: "a1", status: "success", endTime: 11, durationMs: 1 },
    { event: "step_started", stepId: "f1", type: "logic", name: "finalize", startTime: 12 },
    { event: "step_completed", stepId: "f1", status: "success", endTime: 13, durationMs: 1 },
    { event: "run_completed", status: "success", endTime: 14, durationMs: 13 },
  ];
  const bad = [
    { event: "run_started", name: "seven-meta", startTime: 1 },
    { event: "step_started", stepId: "p1", type: "tool", name: "prepare", startTime: 2 },
    { event: "step_completed", stepId: "p1", status: "success", endTime: 3, durationMs: 1 },
    { event: "step_started", stepId: "t1", type: "tool", name: "lookup", startTime: 4 },
    { event: "step_completed", stepId: "t1", status: "success", endTime: 5, durationMs: 1 },
    { event: "step_started", stepId: "r1", type: "tool", name: "refund", startTime: 6 },
    { event: "step_completed", stepId: "r1", status: "success", endTime: 7, durationMs: 1 },
    {
      event: "step_started",
      stepId: "fmt1",
      type: "logic",
      name: "format_optional",
      startTime: 8,
    },
    {
      event: "step_completed",
      stepId: "fmt1",
      status: "success",
      endTime: 9,
      durationMs: 1,
    },
    { event: "step_started", stepId: "l1", type: "llm", name: "answer", startTime: 10 },
    { event: "step_completed", stepId: "l1", status: "success", endTime: 11, durationMs: 1 },
    { event: "step_started", stepId: "f1", type: "logic", name: "finalize", startTime: 12 },
    { event: "step_completed", stepId: "f1", status: "success", endTime: 13, durationMs: 1 },
    { event: "run_completed", status: "success", endTime: 14, durationMs: 13 },
  ];
  return (broken ? bad : safe)
    .map((e, i) =>
      JSON.stringify({
        schemaVersion: "0.1",
        timestamp: i + 1,
        runId,
        ...e,
      }),
    )
    .join("\n");
}

async function evalSeven(
  id: string,
  broken: boolean,
  expected: "pass" | "fail",
) {
  const dir = path.join(baseDir, id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "seven.jsonl");
  writeFileSync(file, sevenLogicalJsonl(broken) + "\n");
  const read = await openTraceFile(file);
  const projection = projectLogicalEvents(read.events);
  const unmatched = projection.diagnostics.filter((d) =>
    d.code.startsWith("AI_LOGICAL_PAIR_UNMATCHED"),
  );
  if (!broken) {
    if (projection.logicalEvents.length !== 7) {
      throw new Error(
        `anitesh safe expected 7 logical events, got ${projection.logicalEvents.length}`,
      );
    }
    if (unmatched.length !== 0) {
      throw new Error(
        `anitesh safe must have valid lifecycle pairs; diagnostics=${JSON.stringify(unmatched)}`,
      );
    }
    console.log(
      `  ${id}: logicalEvents=${projection.logicalEvents.length} (physicalRows=14) unmatched=0`,
    );
  }
  // Metadata-only seven fixture lacks explicit toolCallId consumption links;
  // evaluate presence/order/forbidden structure via a lighter contract.
  const structureOnly = defineTraceContract({
    run: { requireCompleted: true, allowedStatuses: ["ok"] },
    tools: {
      required: ["lookup"],
      forbidden: ["refund"],
    },
    steps: {
      orderRelations: [
        {
          before: { kind: "TOOL", name: "lookup" },
          after: { kind: "LLM", name: "answer" },
          mode: "first-occurrence",
        },
      ],
    },
  });
  const out = evaluateTraceContractRead(read, structureOnly);
  results.push({ id, expected, observed: out.status });
  console.log(`  ${id}: expected=${expected} observed=${out.status}`);
}

await evalSeven("anitesh-seven-safe", false, "pass");
await evalSeven("anitesh-seven-broken", true, "fail");

console.log(
  `classes: ${results
    .map((r) => {
      const short =
        r.id === "V06-retry-ok"
          ? "V06ok"
          : r.id === "V06-retry-excess"
            ? "V06excess"
            : r.id === "V07-wrong-result-ref"
              ? "V07"
              : r.id === "V08-missing-result-ref"
                ? "V08"
                : r.id === "anitesh-seven-safe"
                  ? "A7safe"
                  : r.id === "anitesh-seven-broken"
                    ? "A7broken"
                    : r.id.slice(0, 3);
      return `${short}:${r.observed}`;
    })
    .join(",")}`,
);

const mismatch = results.filter((r) => r.expected !== r.observed);
if (mismatch.length) {
  console.error("classification mismatches", mismatch);
  process.exitCode = 1;
}

const v07 = results.find((r) => r.id === "V07-wrong-result-ref");
if (
  !v07 ||
  v07.observed !== "fail" ||
  !v07.ruleIds?.some((id) =>
    id.includes("successful-result-dependency"),
  )
) {
  console.error("V07 must fail successful-result-dependency", v07);
  process.exitCode = 1;
}
const v08 = results.find((r) => r.id === "V08-missing-result-ref");
if (
  !v08 ||
  v08.observed !== "fail" ||
  !v08.ruleIds?.some((id) =>
    id.includes("successful-result-dependency"),
  )
) {
  console.error("V08 must fail successful-result-dependency", v08);
  process.exitCode = 1;
}
