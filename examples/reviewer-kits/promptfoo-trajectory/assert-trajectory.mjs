/**
 * Promptfoo javascript assertion (output, context).
 * Returns the real trajectory grade — outer verifier interprets expected failures.
 */
import path from "node:path";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  defineTraceContract,
  evaluateTraceContractRead,
} from "agent-inspect/checks";
import { openTrace } from "agent-inspect/readers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function selectRunIdByName(traceDir, runName) {
  const files = readdirSync(traceDir).filter((f) => f.endsWith(".jsonl"));
  const matches = [];
  for (const file of files) {
    const text = readFileSync(path.join(traceDir, file), "utf8");
    if (text.includes(`"name":"${runName}"`) || text.includes(`"name": "${runName}"`)) {
      matches.push(file.replace(/\.jsonl$/, ""));
    }
  }
  if (matches.length !== 1) {
    throw new Error(
      `expected exactly one run named ${runName}, found ${matches.length}`,
    );
  }
  return matches[0];
}

/**
 * @param {string} _output
 * @param {{ providerResponse?: { metadata?: Record<string, unknown> }; metadata?: Record<string, unknown> }} context
 */
export default async function assertTrajectory(_output, context = {}) {
  const meta = context.providerResponse?.metadata ?? context.metadata ?? {};
  const runName = meta.agentInspectRunName;
  const traceDir =
    typeof meta.agentInspectTraceDir === "string"
      ? meta.agentInspectTraceDir
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

  return {
    pass: trajectoryOk,
    score: trajectoryOk ? 1 : 0,
    reason: trajectoryOk
      ? `trajectory pass for ${runId}`
      : `trajectory fail for ${runId}`,
  };
}
