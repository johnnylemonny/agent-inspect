#!/usr/bin/env node
/**
 * Outer verifier for Promptfoo + AgentInspect matrix.
 * Crash ≠ success. Never scans newest traces.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectRun, step } from "agent-inspect";
import {
  defineTraceContract,
  evaluateTraceContractRead,
} from "agent-inspect/checks";
import { openTrace } from "agent-inspect/readers";
import { selectRunIdByName } from "../integration-fixtures/helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRACE_DIR = path.join(__dirname, ".agent-inspect-runs");
const ANSWER = "You have 2 orders";

function fail(msg) {
  console.error(`[promptfoo-use-together] FAIL: ${msg}`);
  process.exitCode = 1;
}

async function capture(runName, toolName) {
  await inspectRun(
    runName,
    async () => {
      await step.tool(toolName, async () => ({ orders: 2 }));
      return ANSWER;
    },
    { silent: true, traceDir: TRACE_DIR },
  );
}

async function trajectoryPass(runName, expectPass) {
  const runId = selectRunIdByName(TRACE_DIR, runName);
  const contract = defineTraceContract({
    run: { requireCompleted: true },
    tools: {
      required: ["lookup_orders"],
      forbidden: ["delete_orders"],
    },
  });
  const read = await openTrace({
    type: "file",
    path: path.join(TRACE_DIR, `${runId}.jsonl`),
  });
  const result = evaluateTraceContractRead(read, contract);
  const ok = result.status === "pass" || result.ok === true;
  if (expectPass && !ok) {
    fail(`expected trajectory pass for ${runName}`);
    return false;
  }
  if (!expectPass && ok) {
    fail(`expected trajectory fail for ${runName}`);
    return false;
  }
  return true;
}

rmSync(TRACE_DIR, { recursive: true, force: true });
mkdirSync(TRACE_DIR, { recursive: true });

await capture("promptfoo-correct-path", "lookup_orders");
await capture("promptfoo-wrong-path", "delete_orders");

// Matrix:
// correct path → answer pass + trajectory pass
// wrong path → answer pass + trajectory fail
// missing/unrelated never pass
let ok = true;
ok = (await trajectoryPass("promptfoo-correct-path", true)) && ok;
ok = (await trajectoryPass("promptfoo-wrong-path", false)) && ok;

try {
  selectRunIdByName(TRACE_DIR, "promptfoo-does-not-exist");
  fail("missing run must throw");
  ok = false;
} catch {
  // expected
}

// Incomplete / unrelated run must not satisfy required tool
await inspectRun(
  "promptfoo-incomplete",
  async () => {
    await step.tool("unrelated_tool", async () => ({}));
  },
  { silent: true, traceDir: TRACE_DIR },
);
ok = (await trajectoryPass("promptfoo-incomplete", false)) && ok;

if (!ok) {
  process.exit(1);
}

console.log(
  "[promptfoo-use-together] OK: matrix correct=pass/pass, wrong=answer-pass/traj-fail, missing/incomplete never pass",
);

// Optional live Promptfoo only when explicitly requested (avoids long npx stalls in CI).
if (process.argv.includes("--promptfoo")) {
  const pf = spawnSync(
    "npx",
    ["--yes", "promptfoo@0.118.17", "eval", "-c", "promptfooconfig.yaml", "--no-cache"],
    {
      cwd: __dirname,
      encoding: "utf8",
      env: { ...process.env, PROMPTFOO_DISABLE_REMOTE_GENERATION: "true" },
      timeout: 120_000,
    },
  );
  if (pf.status === 0) {
    console.log("[promptfoo-use-together] optional promptfoo eval: PASS");
  } else {
    fail(
      `optional promptfoo eval failed: ${(pf.stderr || pf.stdout || "").slice(0, 400)}`,
    );
  }
} else {
  console.log(
    "[promptfoo-use-together] tip: pass --promptfoo to also run example-local promptfoo@0.118.17",
  );
}
