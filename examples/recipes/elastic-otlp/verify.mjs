#!/usr/bin/env node
/**
 * Elastic indexed readback verifier.
 *
 * Offline (default): export OTLP → selected-field compare → offline-sim labeled
 *   explicitly (not "indexed"). Sim hits must come from the export document only.
 *
 * --live: requires ELASTIC_URL + ELASTIC_API_KEY and ELASTIC_OTLP_URL (fresh send).
 *   Parses OTLP partialSuccess; polls until all export span ids appear; compares
 *   identities + selected fields; computes retained/lost from indexed documents.
 *
 * Controlled stub mode: AGENT_INSPECT_ELASTIC_STUB=1 with injects for false-green tests.
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
  compareSelectedSpanFields,
  compareTransportSpans,
  otlpAttrString,
  writeJsonlFixture,
} from "../integration-fixtures/helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const live = process.argv.includes("--live");
const stubMode = process.env.AGENT_INSPECT_ELASTIC_STUB === "1";
const RUN_ID = `elastic_otlp_fixture_${process.pid}_${Date.now().toString(36)}`;
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

function retentionFromSpans(spans, runId) {
  return {
    runId: spans.some((s) => otlpAttrString(s, "agent_inspect.run_id") === runId),
    toolName: spans.some((s) => s.name === TOOL),
    sourceType: spans.some((s) =>
      ["ai-sdk", "adapter"].includes(otlpAttrString(s, "agent_inspect.source.type") ?? ""),
    ),
    numericStatus: spans.every(
      (s) => s.status?.code === 0 || s.status?.code === 1 || s.status?.code === 2,
    ),
    model: spans.some((s) => otlpAttrString(s, "gen_ai.request.model") !== undefined),
    promptBody: false,
  };
}

function fieldReport(observed) {
  const fieldMap = [
    { fact: "runId", retained: observed.runId },
    { fact: "tool name", retained: observed.toolName },
    { fact: "source type", retained: observed.sourceType },
    { fact: "numeric status", retained: observed.numericStatus },
    { fact: "model", retained: observed.model },
    { fact: "prompt/body", retained: observed.promptBody },
  ];
  return {
    fieldMap,
    retained: fieldMap.filter((r) => r.retained).map((r) => r.fact),
    lost: fieldMap.filter((r) => !r.retained).map((r) => r.fact),
  };
}

/**
 * Map Elastic _source documents into OTLP-like spans for compareTransportSpans.
 * Supports AgentInspect export fields when stubbed, and common APM shapes when present.
 */
function spansFromElasticHits(hits) {
  /** @type {Array<Record<string, unknown>>} */
  const out = [];
  for (const hit of hits) {
    const src = hit?._source ?? {};
    if (src.traceId && src.spanId) {
      out.push(src);
      continue;
    }
    const traceId = src.trace?.id ?? src["trace.id"];
    const spanId = src.span?.id ?? src["span.id"];
    if (!traceId || !spanId) continue;
    out.push({
      traceId,
      spanId,
      parentSpanId: src.parent?.id ?? src["parent.id"] ?? "",
      name: src.span?.name ?? src["span.name"] ?? src.name ?? "",
      startTimeUnixNano: src.startTimeUnixNano,
      endTimeUnixNano: src.endTimeUnixNano,
      status: src.status,
      attributes: src.attributes ?? [],
    });
  }
  return out;
}

function parseOtlpSendBody(text) {
  if (!text || !String(text).trim()) {
    return { rejectedSpans: 0 };
  }
  try {
    const parsed = JSON.parse(text);
    const rejected =
      parsed?.partialSuccess?.rejectedSpans ?? parsed?.rejectedSpans ?? 0;
    return { rejectedSpans: Number(rejected) || 0, body: parsed };
  } catch {
    if (/partialSuccess|rejectedSpans/i.test(text)) {
      return { rejectedSpans: -1, raw: text };
    }
    return { rejectedSpans: 0 };
  }
}

async function httpFetch(url, init) {
  if (stubMode) {
    const stub = globalThis.__agentInspectElasticStub;
    if (typeof stub === "function") {
      return stub(url, init);
    }
    throw new Error("AGENT_INSPECT_ELASTIC_STUB=1 requires globalThis.__agentInspectElasticStub");
  }
  return fetch(url, init);
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

const selectedCheck = compareSelectedSpanFields(spans, spans, {
  requireToolName: TOOL,
  requireNumericStatus: true,
});
if (!selectedCheck.ok) {
  fail(`export selected-field comparison: ${selectedCheck.errors.join("; ")}`);
  process.exit(1);
}

const identitySelf = compareTransportSpans(spans, spans, {
  selectedTraceId: exportTraceIds[0],
  invocationId: `${RUN_ID}:${process.pid}`,
});
if (!identitySelf.ok) {
  fail(`export identity self-compare: ${identitySelf.errors.join("; ")}`);
  process.exit(1);
}

function assertIncompleteReadbackControl() {
  const incomplete = spans.map((s) => ({
    ...s,
    spanId: undefined,
    name: s.name,
  }));
  const result = compareTransportSpans(spans, incomplete, {
    selectedTraceId: exportTraceIds[0],
  });
  if (result.ok) {
    fail("incomplete-readback control unexpectedly passed");
    process.exit(1);
  }
}

assertIncompleteReadbackControl();

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

const observedExport = retentionFromSpans(spans, RUN_ID);
const exportFields = fieldReport(observedExport);

const report = {
  deploymentRoute:
    "agent-inspect export → Elastic managed OTLP (ApiKey) → indexed traces-* query by export hex trace.id",
  runId: RUN_ID,
  fieldMap: exportFields.fieldMap,
  retained: exportFields.retained,
  lost: exportFields.lost,
  observedExport,
  observedIndexed: null,
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
  if (!otlpUrl && !stubMode) {
    fail("--live requires ELASTIC_OTLP_URL for a fresh send (acceptance mode)");
    process.exit(1);
  }

  if (otlpUrl || stubMode) {
    const sendUrl = `${String(otlpUrl || "http://stub.invalid").replace(/\/$/, "")}/v1/traces`;
    const send = await httpFetch(sendUrl, {
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
    const sendText = typeof send.text === "function" ? await send.text() : "";
    const parsed = parseOtlpSendBody(sendText);
    if (parsed.rejectedSpans < 0 || parsed.rejectedSpans > 0) {
      fail(`OTLP send partial rejection: rejectedSpans=${parsed.rejectedSpans}`);
      process.exit(1);
    }
  }

  const deadline = Date.now() + 30_000;
  let hits = [];
  let lastStatus = 0;
  while (Date.now() < deadline) {
    const endpoint = new URL("/_search", url).toString();
    const res = await httpFetch(endpoint, {
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
    const indexed = spansFromElasticHits(hits);
    const indexedIds = new Set(indexed.map((s) => String(s.spanId ?? "")));
    const complete = exportSpanIds.every((id) => indexedIds.has(String(id)));
    if (complete && indexed.length >= exportSpanIds.length) {
      hits = hits;
      break;
    }
    hits = hits;
    if (stubMode && hits.length > 0 && !complete) {
      // Stub returned incomplete on purpose — do not keep polling forever.
      break;
    }
    await new Promise((r) => setTimeout(r, stubMode ? 0 : 1000));
    if (stubMode) break;
  }

  const indexedSpans = spansFromElasticHits(hits);
  const indexedIds = new Set(indexedSpans.map((s) => String(s.spanId ?? "")));
  const missingSpanIds = exportSpanIds.filter((id) => !indexedIds.has(String(id)));
  if (missingSpanIds.length > 0) {
    fail(
      `live indexed readback incomplete (http=${lastStatus}, hits=${hits.length}, missingSpanIds=${missingSpanIds.join(",")})`,
    );
    process.exit(1);
  }

  const identityLive = compareTransportSpans(spans, indexedSpans, {
    selectedTraceId: exportTraceIds[0],
    invocationId: `${RUN_ID}:${process.pid}:live`,
  });
  if (!identityLive.ok) {
    fail(`live identity comparison: ${identityLive.errors.join("; ")}`);
    process.exit(1);
  }
  const fieldsLive = compareSelectedSpanFields(spans, indexedSpans, {
    requireToolName: TOOL,
    requireNumericStatus: true,
  });
  if (!fieldsLive.ok) {
    fail(`live selected-field comparison: ${fieldsLive.errors.join("; ")}`);
    process.exit(1);
  }

  const observedIndexed = retentionFromSpans(indexedSpans, RUN_ID);
  const indexedFields = fieldReport(observedIndexed);
  report.observedIndexed = observedIndexed;
  report.fieldMap = indexedFields.fieldMap;
  report.retained = indexedFields.retained;
  report.lost = indexedFields.lost;
  report.live = {
    status: "indexed_exact_spans",
    httpStatus: lastStatus,
    hitCount: hits.length,
    exportTraceIds,
    exportSpanIds,
    matchedSpanIds: [...indexedIds],
  };
}

writeFileSync(path.join(work, "field-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `[elastic-otlp] OK: export validated; ${live ? "live exact-span indexed" : "offline export-document-sim"}`,
);
console.log(`  runId=${RUN_ID}`);
console.log(`  retained=${report.retained.join(",")} lost=${report.lost.join(",")}`);
if (live) {
  console.log(
    `  liveHits=${report.live.hitCount} spans=${report.live.matchedSpanIds.length}/${exportSpanIds.length}`,
  );
} else {
  console.log(`  offlineSimHits=${offlineQuery.total} (not indexed)`);
}
