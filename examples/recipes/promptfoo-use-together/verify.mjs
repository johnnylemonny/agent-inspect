#!/usr/bin/env node
/**
 * Outer verifier for Promptfoo + AgentInspect matrix.
 * Offline AgentInspect trajectory checks always run.
 * Promptfoo CLI path uses a fresh per-invocation directory and the shared
 * matrix interpreter (no stale JSON, no positional case matching).
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectRun, step } from "agent-inspect";
import {
  defineTraceContract,
  evaluateTraceContractRead,
} from "agent-inspect/checks";
import { openTrace } from "agent-inspect/readers";
import { selectRunIdByName } from "../integration-fixtures/helpers.mjs";
import {
  PINNED_PROMPTFOO_VERSION,
  createInvocationWorkspace,
  evaluatePromptfooInvocation,
} from "./lib/matrix-interpret.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRACE_DIR = path.join(__dirname, ".agent-inspect-runs");
const WORK_ROOT = path.join(__dirname, ".recipe-work");
const ANSWER = "You have 2 orders";
const offlineOnly = process.argv.includes("--offline-only");

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

function resolvePromptfooBin() {
  const local = path.join(__dirname, "node_modules", ".bin", "promptfoo");
  if (existsSync(local)) return { command: local, prefixArgs: [] };
  return {
    command: "npx",
    prefixArgs: ["--yes", `promptfoo@${PINNED_PROMPTFOO_VERSION}`],
  };
}

rmSync(TRACE_DIR, { recursive: true, force: true });
mkdirSync(TRACE_DIR, { recursive: true });
mkdirSync(WORK_ROOT, { recursive: true });

await capture("promptfoo-correct-path", "lookup_orders");
await capture("promptfoo-wrong-path", "delete_orders");

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
  "[promptfoo-use-together] offline matrix OK: correct=pass/pass, wrong=answer-pass/traj-fail, missing/incomplete never pass",
);

if (offlineOnly) {
  console.log("[promptfoo-use-together] --offline-only: skipping Promptfoo CLI");
  process.exit(0);
}

const invocation = createInvocationWorkspace(WORK_ROOT, "recipe");
const bin = resolvePromptfooBin();
const pf = spawnSync(
  bin.command,
  [
    ...bin.prefixArgs,
    "eval",
    "-c",
    "promptfooconfig.yaml",
    "--no-cache",
    "-o",
    invocation.resultsPath,
  ],
  {
    cwd: __dirname,
    encoding: "utf8",
    env: { ...process.env, PROMPTFOO_DISABLE_REMOTE_GENERATION: "true" },
    timeout: 180_000,
  },
);

const timedOut = pf.error?.code === "ETIMEDOUT" || pf.signal === "SIGTERM";
const child = {
  status: pf.status,
  error: pf.error ?? null,
  signal: pf.signal ?? null,
  timedOut,
};

let resultsJson;
if (existsSync(invocation.resultsPath)) {
  try {
    resultsJson = readFileSync(invocation.resultsPath, "utf8");
  } catch (error) {
    fail(
      `unreadable invocation results: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

const evaluated = evaluatePromptfooInvocation(child, resultsJson);
writeFileSync(
  invocation.summaryPath,
  `${JSON.stringify(
    {
      invocationId: invocation.invocationId,
      childKind: evaluated.childKind,
      ok: evaluated.ok,
      failures: evaluated.failures,
      summary: evaluated.summary,
      promptfooVersion: PINNED_PROMPTFOO_VERSION,
      note: "Actual Promptfoo CLI completion is distinct from synthetic matrix-interpret controls.",
    },
    null,
    2,
  )}\n`,
);

if (!evaluated.ok) {
  for (const message of evaluated.failures) {
    fail(message);
  }
  if (child.status !== 0 && !existsSync(invocation.resultsPath)) {
    fail(
      `promptfoo eval failed to produce results for ${invocation.invocationId}: ${(pf.stderr || pf.stdout || "").slice(0, 600)}`,
    );
  }
  process.exit(1);
}

console.log(
  `[promptfoo-use-together] Promptfoo matrix OK (invocation ${invocation.invocationId}): correct=pass, wrong=traj-fail, missing=fail`,
);
console.log(`[promptfoo-use-together] summary: ${invocation.summaryPath}`);
