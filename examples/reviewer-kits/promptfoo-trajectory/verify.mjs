#!/usr/bin/env node
/**
 * Standalone reviewer verify — fresh invocation dir + shared matrix interpreter.
 * Never reuses results/ after a failed or unexpected child exit.
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
import {
  PINNED_PROMPTFOO_VERSION,
  createInvocationWorkspace,
  evaluatePromptfooInvocation,
} from "./lib/matrix-interpret.mjs";
import { resolveAgentInspectVersion } from "./lib/resolve-agent-inspect-version.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRACE_DIR = path.join(__dirname, ".agent-inspect-runs");
const RESULTS_ROOT = path.join(__dirname, "results");

function fail(msg) {
  console.error(`[reviewer-kit] FAIL: ${msg}`);
  process.exitCode = 1;
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
mkdirSync(RESULTS_ROOT, { recursive: true });

const invocation = createInvocationWorkspace(RESULTS_ROOT, "kit");
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
const agentInspect = resolveAgentInspectVersion();
const latestSummary = path.join(RESULTS_ROOT, "matrix-summary.json");
writeFileSync(
  invocation.summaryPath,
  `${JSON.stringify(
    {
      invocationId: invocation.invocationId,
      childKind: evaluated.childKind,
      ok: evaluated.ok && agentInspect.ok,
      failures: [...evaluated.failures, ...agentInspect.failures],
      summary: evaluated.summary,
      promptfooVersion: PINNED_PROMPTFOO_VERSION,
      agentInspectConfigured: agentInspect.configured,
      agentInspectResolved: agentInspect.resolved,
      agentInspectResolvedPath: agentInspect.resolvedPath,
      testedNode: `>=20 (runtime ${process.version})`,
      sourceRevision: process.env.GITHUB_SHA ?? null,
    },
    null,
    2,
  )}\n`,
);
// Pointer only — never the sole source of truth after a failed invocation.
if (evaluated.ok) {
  writeFileSync(latestSummary, readFileSync(invocation.summaryPath));
} else if (existsSync(latestSummary)) {
  // Do not leave a prior success looking current after this failure.
  writeFileSync(
    latestSummary,
    `${JSON.stringify(
      {
        ok: false,
        stale: false,
        incomplete: true,
        invocationId: invocation.invocationId,
        failures: evaluated.failures,
      },
      null,
      2,
    )}\n`,
  );
}

if (!evaluated.ok || !agentInspect.ok) {
  for (const message of [...evaluated.failures, ...agentInspect.failures]) {
    fail(message);
  }
  if (!existsSync(invocation.resultsPath)) {
    fail(
      `promptfoo produced no results for ${invocation.invocationId}: ${(pf.stderr || pf.stdout || "").slice(0, 600)}`,
    );
  }
  process.exit(1);
}

console.log(
  `[reviewer-kit] OK — invocation ${invocation.invocationId}; see ${invocation.summaryPath}`,
);
