/**
 * Promptfoo javascript assertion: TraceContract trajectory gate.
 * Requires metadata.agentInspectRunName (exact) — never newest-trace scanning.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  defineTraceContract,
  evaluateTraceContractRead,
} from "agent-inspect/checks";
import { openTrace } from "agent-inspect/readers";
import { selectRunIdByName } from "../integration-fixtures/helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @param {{ output?: string; metadata?: Record<string, unknown>; vars?: { expectTrajectory?: string } }} ctx
 */
export default async function assertTrajectory(ctx) {
  const runName = ctx.metadata?.agentInspectRunName;
  const traceDir =
    typeof ctx.metadata?.agentInspectTraceDir === "string"
      ? ctx.metadata.agentInspectTraceDir
      : path.join(__dirname, ".agent-inspect-runs");
  if (typeof runName !== "string" || runName.trim() === "") {
    return {
      pass: false,
      score: 0,
      reason: "missing metadata.agentInspectRunName (exact run required)",
    };
  }

  let runId;
  try {
    runId = selectRunIdByName(traceDir, runName);
  } catch (error) {
    return {
      pass: false,
      score: 0,
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  const expectPass = ctx.vars?.expectTrajectory !== "fail";
  const contract = defineTraceContract({
    run: { requireCompleted: true },
    tools: {
      required: ["lookup_orders"],
      forbidden: ["delete_orders"],
      requiredOrder: ["lookup_orders"],
    },
  });

  const read = await openTrace({
    type: "file",
    path: path.join(traceDir, `${runId}.jsonl`),
  });
  const result = evaluateTraceContractRead(read, contract);
  const trajectoryOk = result.status === "pass" || result.ok === true;

  if (expectPass) {
    return {
      pass: trajectoryOk,
      score: trajectoryOk ? 1 : 0,
      reason: trajectoryOk
        ? `trajectory pass for ${runId}`
        : `trajectory fail for ${runId}: ${JSON.stringify(result.findings ?? result)}`,
    };
  }

  // Expect trajectory to fail (wrong path)
  const correctlyFailed = !trajectoryOk;
  return {
    pass: correctlyFailed,
    score: correctlyFailed ? 1 : 0,
    reason: correctlyFailed
      ? `trajectory correctly failed for ${runId}`
      : `expected trajectory fail but passed for ${runId}`,
  };
}
