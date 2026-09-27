#!/usr/bin/env node
/**
 * Outer verifier for Promptfoo + AgentInspect matrix.
 * Default path runs Promptfoo 0.118.17 and checks the per-case result matrix.
 * Crash / provider load failure / all-failed eval ≠ success.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
const OUT_JSON = path.join(__dirname, ".recipe-work", "promptfoo-results.json");
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

rmSync(TRACE_DIR, { recursive: true, force: true });
mkdirSync(TRACE_DIR, { recursive: true });
mkdirSync(path.dirname(OUT_JSON), { recursive: true });

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

const pf = spawnSync(
  "npx",
  [
    "--yes",
    "promptfoo@0.118.17",
    "eval",
    "-c",
    "promptfooconfig.yaml",
    "--no-cache",
    "-o",
    OUT_JSON,
  ],
  {
    cwd: __dirname,
    encoding: "utf8",
    env: { ...process.env, PROMPTFOO_DISABLE_REMOTE_GENERATION: "true" },
    timeout: 180_000,
  },
);

if (pf.status !== 0 && !existsSync(OUT_JSON)) {
  fail(
    `promptfoo eval failed to produce results: ${(pf.stderr || pf.stdout || "").slice(0, 600)}`,
  );
  process.exit(1);
}

let results;
try {
  results = JSON.parse(readFileSync(OUT_JSON, "utf8"));
} catch (error) {
  fail(`unreadable promptfoo results: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const rows = Array.isArray(results.results)
  ? results.results
  : Array.isArray(results)
    ? results
    : results.results?.results ?? [];

if (!Array.isArray(rows) || rows.length < 3) {
  // promptfoo JSON shapes vary; also accept table under results.table / results.results
  const alt =
    results?.results?.table ??
    results?.table ??
    results?.results ??
    [];
  const flat = Array.isArray(alt) ? alt : [];
  if (flat.length < 3) {
    fail(
      `promptfoo results missing expected cases (got ${flat.length || rows.length}); raw keys=${Object.keys(results).join(",")}`,
    );
    process.exit(1);
  }
}

function casePass(row) {
  if (typeof row.success === "boolean") return row.success;
  if (typeof row.pass === "boolean") return row.pass;
  if (Array.isArray(row.gradingResult?.componentResults)) {
    return row.gradingResult.componentResults.every((c) => c.pass === true);
  }
  if (row.gradingResult && typeof row.gradingResult.pass === "boolean") {
    return row.gradingResult.pass;
  }
  return undefined;
}

function describeRow(row, index) {
  return (
    row.description ??
    row.testCase?.description ??
    row.vars?.path ??
    `case-${index}`
  );
}

const normalized = (Array.isArray(rows) && rows.length >= 3
  ? rows
  : results?.results?.table ?? results?.table ?? []
).slice(0, 3);

const correct = normalized[0];
const wrong = normalized[1];
const missing = normalized[2];

const correctOk = casePass(correct) === true;
const wrongAnswerPass =
  Array.isArray(wrong?.gradingResult?.componentResults)
    ? wrong.gradingResult.componentResults.some(
        (c) => c.pass === true && /equals|answer/i.test(String(c.assertion?.type ?? c.reason ?? "")),
      ) || wrong?.response?.output === ANSWER
    : wrong?.response?.output === ANSWER || wrong?.output === ANSWER;
const wrongTrajFail =
  Array.isArray(wrong?.gradingResult?.componentResults)
    ? wrong.gradingResult.componentResults.some((c) => c.pass === false)
    : casePass(wrong) === false;
const missingFail = casePass(missing) === false;

writeFileSync(
  path.join(path.dirname(OUT_JSON), "matrix-summary.json"),
  `${JSON.stringify(
    {
      correct: { description: describeRow(correct, 0), pass: correctOk },
      wrong: {
        description: describeRow(wrong, 1),
        answerLikelyPass: wrongAnswerPass,
        trajectoryFailed: wrongTrajFail,
        overallPass: casePass(wrong),
      },
      missing: { description: describeRow(missing, 2), pass: casePass(missing) },
    },
    null,
    2,
  )}\n`,
);

if (!correctOk) {
  fail(`expected correct case to pass (got ${describeRow(correct, 0)})`);
  process.exit(1);
}
if (!wrongTrajFail) {
  fail(`expected wrong-path trajectory assertion to fail`);
  process.exit(1);
}
if (!missingFail) {
  fail(`expected missing-metadata case to fail`);
  process.exit(1);
}

console.log(
  "[promptfoo-use-together] Promptfoo matrix OK: correct=pass, wrong=traj-fail, missing=fail",
);
