#!/usr/bin/env node
/**
 * Standalone reviewer verify — runs Promptfoo and writes matrix-summary.json.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRACE_DIR = path.join(__dirname, ".agent-inspect-runs");
const RESULTS_DIR = path.join(__dirname, "results");
const OUT_JSON = path.join(RESULTS_DIR, "promptfoo-results.json");
const SUMMARY = path.join(RESULTS_DIR, "matrix-summary.json");

function fail(msg) {
  console.error(`[reviewer-kit] FAIL: ${msg}`);
  process.exitCode = 1;
}

rmSync(TRACE_DIR, { recursive: true, force: true });
mkdirSync(TRACE_DIR, { recursive: true });
mkdirSync(RESULTS_DIR, { recursive: true });

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

if (!existsSync(OUT_JSON)) {
  fail(`promptfoo produced no results: ${(pf.stderr || pf.stdout || "").slice(0, 600)}`);
  process.exit(1);
}

const results = JSON.parse(readFileSync(OUT_JSON, "utf8"));
const rows = Array.isArray(results.results)
  ? results.results
  : results?.results?.results ?? results?.results?.table ?? results?.table ?? [];

if (!Array.isArray(rows) || rows.length < 3) {
  fail(`expected >=3 result rows, got ${Array.isArray(rows) ? rows.length : 0}`);
  process.exit(1);
}

function casePass(row) {
  if (typeof row.success === "boolean") return row.success;
  if (typeof row.pass === "boolean") return row.pass;
  if (row.gradingResult && typeof row.gradingResult.pass === "boolean") {
    return row.gradingResult.pass;
  }
  if (Array.isArray(row.gradingResult?.componentResults)) {
    return row.gradingResult.componentResults.every((c) => c.pass === true);
  }
  return undefined;
}

const [correct, wrong, missing] = rows;
const summary = {
  correct: { pass: casePass(correct) === true },
  wrong: {
    overallPass: casePass(wrong),
    trajectoryComponentFailed: Array.isArray(wrong?.gradingResult?.componentResults)
      ? wrong.gradingResult.componentResults.some((c) => c.pass === false)
      : casePass(wrong) === false,
  },
  missing: { pass: casePass(missing) === false },
};

writeFileSync(SUMMARY, `${JSON.stringify(summary, null, 2)}\n`);

if (!summary.correct.pass) {
  fail("correct case must pass");
  process.exit(1);
}
if (!summary.wrong.trajectoryComponentFailed && summary.wrong.overallPass !== false) {
  fail("wrong-path trajectory must fail");
  process.exit(1);
}
if (!summary.missing.pass) {
  fail("missing-metadata case must fail");
  process.exit(1);
}

console.log("[reviewer-kit] OK — see results/matrix-summary.json");
