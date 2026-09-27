#!/usr/bin/env node
/**
 * Collector round-trip verifier.
 *
 * Modes:
 *   (default) fixture-self-test — compare export as a simulated collector batch
 *                                 (explicitly labeled; not a live Collector claim).
 *   --docker  collector — real Collector ingestion; independent /out file readback.
 *                         Empty/rejected/missing output fails (no export fallback).
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
  buildAdapterFixtureEvents,
  collectSpans,
  compareExpectedFacts,
  parseCollectorBatches,
  writeJsonlFixture,
} from "../integration-fixtures/helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const useDocker = process.argv.includes("--docker");
const COLLECTOR_IMAGE_DEFAULT = "otel/opentelemetry-collector-contrib:0.109.0";
const CONTAINER = `agent-inspect-otel-roundtrip-${process.pid}`;
const RUN_ID = "collector_roundtrip_fixture";
const TOOL = "lookup_orders";
const work = path.join(__dirname, `.recipe-work-${process.pid}`);
const traceDir = path.join(work, "traces");
const otlpOut = path.join(work, "otlp.json");
const collected = path.join(work, "collected-traces.json");

function fail(msg) {
  console.error(`[otel-collector-roundtrip] FAIL: ${msg}`);
  process.exitCode = 1;
}

function run(label, command, args, opts = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    cwd: opts.cwd ?? __dirname,
    env: opts.env ?? process.env,
  });
  if (result.status !== 0) {
    fail(
      `${label}: ${result.error?.message ?? ""}\n${result.stdout}\n${result.stderr}`.trim(),
    );
    return null;
  }
  return result;
}

function resolveCli() {
  const local = path.resolve(__dirname, "../../../packages/cli/dist/index.cjs");
  if (existsSync(local)) return { cmd: process.execPath, argsPrefix: [local] };
  return { cmd: "npx", argsPrefix: ["agent-inspect"] };
}

function waitForFile(filePath, timeoutMs = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (existsSync(filePath) && readFileSync(filePath, "utf8").trim() !== "") {
      return true;
    }
    spawnSync("sleep", ["0.25"]);
  }
  return false;
}

function waitForReady(timeoutMs = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const probe = spawnSync(
      "curl",
      ["-sS", "-o", "/dev/null", "-w", "%{http_code}", "http://127.0.0.1:4318/"],
      { encoding: "utf8" },
    );
    // Any HTTP response means the port is accepting connections.
    if (probe.status === 0 && String(probe.stdout).trim() !== "000") {
      return true;
    }
    spawnSync("sleep", ["0.25"]);
  }
  return false;
}

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
writeJsonlFixture(
  traceDir,
  RUN_ID,
  buildAdapterFixtureEvents(RUN_ID, { toolName: TOOL, answer: "You have 2 orders" }),
);

const cli = resolveCli();
const exportResult = run("export otlp-json", cli.cmd, [
  ...cli.argsPrefix,
  "export",
  RUN_ID,
  "--dir",
  traceDir,
  "--format",
  "otlp-json",
  "--out",
  otlpOut,
  "--validate",
  "--json",
]);
if (!exportResult) process.exit(1);

const exportPayload = JSON.parse(exportResult.stdout);
if (exportPayload.validation && exportPayload.validation.ok === false) {
  fail(`export validation failed: ${exportPayload.validation.errors?.join("; ")}`);
  process.exit(1);
}

const otlpContent = readFileSync(otlpOut, "utf8");
const otlpDoc = JSON.parse(otlpContent);
const exportSpans = collectSpans(otlpDoc);
const exportTraceId = exportSpans[0]?.traceId;
const exportCheck = compareExpectedFacts(exportSpans, {
  runId: RUN_ID,
  toolName: TOOL,
  requireNumericStatus: true,
});
if (!exportCheck.ok) {
  fail(`export field comparison: ${exportCheck.errors.join("; ")}`);
  process.exit(1);
}

/** @type {unknown[]} */
let batches;
/** @type {"fixture-self-test" | "collector"} */
let mode = "fixture-self-test";

if (useDocker) {
  mode = "collector";
  const image = process.env.OTEL_COLLECTOR_IMAGE || COLLECTOR_IMAGE_DEFAULT;
  console.log(`[otel-collector-roundtrip] mode=collector image=${image}`);
  if (!String(image).includes("@sha256:")) {
    console.error(
      "[otel-collector-roundtrip] tip: set OTEL_COLLECTOR_IMAGE=...@sha256:<digest> after verifying",
    );
  }
  writeFileSync(collected, "", "utf8");
  const dockerRun = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "-d",
      "--name",
      CONTAINER,
      "-p",
      "127.0.0.1:4318:4318",
      "-v",
      `${path.join(__dirname, "collector.yaml")}:/etc/otelcol/config.yaml:ro`,
      "-v",
      `${work}:/out`,
      image,
      "--config=/etc/otelcol/config.yaml",
    ],
    { encoding: "utf8" },
  );
  if (dockerRun.status !== 0) {
    fail(`docker run failed: ${dockerRun.stderr}`);
    process.exit(1);
  }
  try {
    if (!waitForReady()) {
      fail("collector readiness timeout on 127.0.0.1:4318");
      process.exit(1);
    }
    const curl = spawnSync(
      "curl",
      [
        "-sS",
        "-w",
        "\n%{http_code}",
        "-X",
        "POST",
        "http://127.0.0.1:4318/v1/traces",
        "-H",
        "Content-Type: application/json",
        "--data-binary",
        `@${otlpOut}`,
      ],
      { encoding: "utf8" },
    );
    if (curl.status !== 0) {
      fail(`curl POST failed: ${curl.stderr}`);
      process.exit(1);
    }
    const lines = String(curl.stdout ?? "").trim().split("\n");
    const httpCode = lines[lines.length - 1] ?? "";
    const body = lines.slice(0, -1).join("\n");
    if (httpCode !== "200" && httpCode !== "202") {
      fail(`collector transport rejected payload (HTTP ${httpCode}): ${body.slice(0, 200)}`);
      process.exit(1);
    }
    if (body.includes("rejected") || body.includes('"partialSuccess"')) {
      try {
        const parsed = JSON.parse(body);
        const rejected =
          parsed?.partialSuccess?.rejectedSpans ??
          parsed?.rejectedSpans ??
          0;
        if (Number(rejected) > 0) {
          fail(`collector partial rejection: rejectedSpans=${rejected}`);
          process.exit(1);
        }
      } catch {
        fail(`collector reported rejection/partialSuccess: ${body.slice(0, 200)}`);
        process.exit(1);
      }
    }
    if (!waitForFile(collected)) {
      fail(
        "collector file empty after deadline — independent readback required (no export fallback)",
      );
      process.exit(1);
    }
    batches = parseCollectorBatches(collected);
  } finally {
    spawnSync("docker", ["rm", "-f", CONTAINER], { encoding: "utf8" });
  }
} else {
  writeFileSync(collected, `${otlpContent}\n`, "utf8");
  batches = parseCollectorBatches(collected);
  console.log(
    "[otel-collector-roundtrip] mode=fixture-self-test (not a live Collector claim)",
  );
}

if (!batches || batches.length === 0) {
  fail("no collector batches");
  process.exit(1);
}

const allSpans = batches.flatMap((b) => collectSpans(b));
if (exportTraceId && !allSpans.some((s) => s.traceId === exportTraceId)) {
  fail(`collector output missing exact export traceId ${exportTraceId}`);
  process.exit(1);
}
const fieldCheck = compareExpectedFacts(allSpans, {
  runId: RUN_ID,
  toolName: TOOL,
  requireNumericStatus: true,
});
if (!fieldCheck.ok) {
  fail(`collector field comparison: ${fieldCheck.errors.join("; ")}`);
  process.exit(1);
}

const importResult = run("open otlp", cli.cmd, [
  ...cli.argsPrefix,
  "open",
  collected,
  "--format",
  "otlp-json",
  "--json",
]);
if (!importResult) process.exit(1);
const imported = JSON.parse(importResult.stdout);
const importedText = JSON.stringify(imported);
if (!importedText.includes(TOOL)) {
  fail("re-import missing tool name");
  process.exit(1);
}

console.log(
  `[otel-collector-roundtrip] OK mode=${mode}: field compare + re-import`,
);
console.log(`  spans=${allSpans.length} batches=${batches.length} numericStatus=required`);
