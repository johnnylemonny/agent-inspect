#!/usr/bin/env node
/**
 * Elastic indexed readback verifier.
 *
 * Offline (default): export OTLP → field compare → offline-sim labeled explicitly
 *   (not "indexed"). Sim hits must come from the export document only.
 *
 * --live: requires ELASTIC_URL (+ optional ELASTIC_API_KEY). Sends the export to
 *   the managed OTLP endpoint when ELASTIC_OTLP_URL is set, then queries by the
 *   exact exported hex trace.id. Missing config, zero hits, or unrelated hits fail.
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
  writeJsonlFixture,
} from "../integration-fixtures/helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const live = process.argv.includes("--live");
const RUN_ID = "elastic_otlp_fixture";
const TOOL = "lookup_orders";
const work = path.join(__dirname, `.recipe-work-${process.pid}`);
const traceDir = path.join(work, "traces");
const otlpOut = path.join(work, "otlp.json");

function fail(msg) {
  console.error(`[elastic-otlp] FAIL: ${msg}`);
  process.exitCode = 1;
}

function run(label, command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", cwd: __dirname });
  if (result.status !== 0) {
    fail(`${label}: ${result.stderr || result.stdout}`);
    return null;
  }
  return result;
}

function resolveCli() {
  const local = path.resolve(__dirname, "../../../packages/cli/dist/index.cjs");
  if (existsSync(local)) return { cmd: process.execPath, argsPrefix: [local] };
  return { cmd: "npx", argsPrefix: ["agent-inspect"] };
}

function attrString(span, key) {
  const hit = (span.attributes ?? []).find((a) => a.key === key);
  return hit?.value?.stringValue;
}

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
writeJsonlFixture(
  traceDir,
  RUN_ID,
  buildAdapterFixtureEvents(RUN_ID, { toolName: TOOL, answer: "You have 2 orders" }),
);

const cli = resolveCli();
const exportResult = run("export", cli.cmd, [
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

const otlp = JSON.parse(readFileSync(otlpOut, "utf8"));
const spans = collectSpans(otlp);
const exportTraceIds = [...new Set(spans.map((s) => s.traceId).filter(Boolean))];
const exportSpanIds = [...new Set(spans.map((s) => s.spanId).filter(Boolean))];
if (exportTraceIds.length === 0) {
  fail("export missing traceId");
  process.exit(1);
}

const check = compareExpectedFacts(spans, {
  runId: RUN_ID,
  toolName: TOOL,
  requireNumericStatus: true,
});
if (!check.ok) {
  fail(`field comparison: ${check.errors.join("; ")}`);
  process.exit(1);
}

/** Offline sim: only IDs actually present in the export document. */
function queryExportDocument(queryIds) {
  const haystack = JSON.stringify(spans);
  const hits = queryIds.filter((id) => haystack.includes(id));
  return { hits, total: hits.length };
}

const offlineQuery = queryExportDocument([RUN_ID, TOOL, ...exportTraceIds]);
if (offlineQuery.total === 0) {
  fail("offline export query returned zero hits for fixture IDs");
  process.exit(1);
}

const observed = {
  runId: spans.some((s) => attrString(s, "agent_inspect.run_id") === RUN_ID),
  toolName: spans.some((s) => s.name === TOOL),
  sourceType: spans.some((s) =>
    ["ai-sdk", "adapter"].includes(attrString(s, "agent_inspect.source.type") ?? ""),
  ),
  numericStatus: spans.every(
    (s) => s.status?.code === 0 || s.status?.code === 1 || s.status?.code === 2,
  ),
  model: spans.some((s) =>
    (s.attributes ?? []).some((a) => a.key === "gen_ai.request.model"),
  ),
  promptBody: false,
};

const fieldMap = [
  { fact: "runId", retained: observed.runId },
  { fact: "tool name", retained: observed.toolName },
  { fact: "source type", retained: observed.sourceType },
  { fact: "numeric status", retained: observed.numericStatus },
  { fact: "model", retained: observed.model },
  { fact: "prompt/body", retained: observed.promptBody },
];

const report = {
  deploymentRoute:
    "agent-inspect export → Elastic managed OTLP (ApiKey) → indexed traces-* query by export hex trace.id",
  fieldMap,
  retained: fieldMap.filter((r) => r.retained).map((r) => r.fact),
  lost: fieldMap.filter((r) => !r.retained).map((r) => r.fact),
  offlineSim: {
    label: "export-document-sim (not indexed)",
    fixtureIds: [RUN_ID, TOOL, ...exportTraceIds],
    hits: offlineQuery.hits,
    total: offlineQuery.total,
  },
  live: null,
};

if (live) {
  const url = process.env.ELASTIC_URL;
  const apiKey = process.env.ELASTIC_API_KEY;
  const otlpUrl = process.env.ELASTIC_OTLP_URL;
  if (!url || !apiKey) {
    fail("--live requires ELASTIC_URL and ELASTIC_API_KEY");
    process.exit(1);
  }

  if (otlpUrl) {
    const send = await fetch(`${otlpUrl.replace(/\/$/, "")}/v1/traces`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `ApiKey ${apiKey}`,
      },
      body: readFileSync(otlpOut),
    });
    if (!send.ok) {
      fail(`OTLP send failed: HTTP ${send.status}`);
      process.exit(1);
    }
  } else {
    console.error(
      "[elastic-otlp] note: ELASTIC_OTLP_URL unset — assuming prior ingestion; still requiring exact-trace indexed readback",
    );
  }

  const deadline = Date.now() + 30_000;
  let hits = [];
  let lastStatus = 0;
  while (Date.now() < deadline) {
    const endpoint = new URL("/_search", url).toString();
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `ApiKey ${apiKey}`,
      },
      body: JSON.stringify({
        size: 50,
        query: {
          bool: {
            filter: [
              {
                terms: {
                  "trace.id": exportTraceIds,
                },
              },
            ],
          },
        },
      }),
    });
    lastStatus = res.status;
    if (!res.ok) {
      fail(`live search HTTP ${res.status} — not indexed success`);
      process.exit(1);
    }
    const body = await res.json();
    hits = body?.hits?.hits ?? [];
    if (hits.length > 0) break;
    await new Promise((r) => setTimeout(r, 1000));
  }

  const hitTraceIds = hits
    .map((h) => h?._source?.trace?.id ?? h?._source?.["trace.id"])
    .filter(Boolean);
  const exact = hitTraceIds.filter((id) => exportTraceIds.includes(id));
  if (exact.length === 0) {
    fail(
      `live indexed readback found no exact export trace.id (http=${lastStatus}, hits=${hits.length})`,
    );
    process.exit(1);
  }
  report.live = {
    status: "indexed_exact_trace",
    httpStatus: lastStatus,
    hitCount: hits.length,
    exportTraceIds,
    matchedTraceIds: exact,
    exportSpanIds,
  };
}

writeFileSync(path.join(work, "field-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `[elastic-otlp] OK: export validated; ${live ? "live exact-trace indexed" : "offline export-document-sim"}`,
);
console.log(`  retained=${report.retained.join(",")} lost=${report.lost.join(",")}`);
if (live) {
  console.log(`  liveHits=${report.live.hitCount} traces=${report.live.matchedTraceIds.join(",")}`);
} else {
  console.log(`  offlineSimHits=${offlineQuery.total} (not indexed)`);
}
