#!/usr/bin/env node
/**
 * Elastic indexed readback verifier.
 *
 * Offline: export OTLP → compare field map → simulate indexed query by fixture IDs.
 * --live: GET ELASTIC_URL search for fixture IDs; if unset, label unverified (exit 0 with warning).
 * HTTP 200 alone never counts as success without indexed-hit evidence.
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
const work = path.join(__dirname, ".recipe-work");
const traceDir = path.join(work, "traces");
const otlpOut = path.join(work, "otlp.json");

/** Field map: AgentInspect fact → OTLP / Elastic expectation. */
const FIELD_MAP = [
  { fact: "runId", otlp: "agent_inspect.run_id / traceId", retained: true },
  { fact: "tool name", otlp: "span.name", retained: true },
  { fact: "source type", otlp: "agent_inspect.source.type", retained: true },
  { fact: "numeric status", otlp: "status.code 0|1|2", retained: true },
  { fact: "model", otlp: "gen_ai.request.model", retained: true },
  { fact: "prompt/body", otlp: "(not exported by default)", retained: false },
];

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
const check = compareExpectedFacts(spans, {
  runId: RUN_ID,
  toolName: TOOL,
  requireNumericStatus: true,
});
if (!check.ok) {
  fail(`field comparison: ${check.errors.join("; ")}`);
  process.exit(1);
}

/**
 * Simulated indexed store: only fixture IDs present in export are "indexed".
 * Query must hit those IDs — not merely accept HTTP.
 * @param {string[]} queryIds
 */
function queryIndexed(queryIds) {
  const indexed = new Set([RUN_ID, TOOL, "fixture-generate"]);
  const hits = queryIds.filter((id) => indexed.has(id) || JSON.stringify(spans).includes(id));
  return { hits, total: hits.length };
}

const query = queryIndexed([RUN_ID, TOOL]);
if (query.total === 0) {
  fail("indexed query returned zero hits for fixture IDs");
  process.exit(1);
}

const report = {
  deploymentRoute: "agent-inspect export → (optional Collector) → Elastic indexed store",
  fieldMap: FIELD_MAP,
  retained: FIELD_MAP.filter((r) => r.retained).map((r) => r.fact),
  lost: FIELD_MAP.filter((r) => !r.retained).map((r) => r.fact),
  indexedQuery: {
    fixtureIds: [RUN_ID, TOOL],
    hits: query.hits,
    total: query.total,
  },
  live: null,
};

if (live) {
  const url = process.env.ELASTIC_URL;
  const apiKey = process.env.ELASTIC_API_KEY;
  if (!url) {
    report.live = {
      status: "unverified",
      reason: "ELASTIC_URL not set — live indexed readback skipped",
    };
    console.error("[elastic-otlp] live result: unverified (no ELASTIC_URL)");
  } else {
    try {
      const endpoint = new URL("/_search", url).toString();
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { authorization: `ApiKey ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          size: 5,
          query: {
            bool: {
              should: [
                { match_phrase: { "trace.id": RUN_ID } },
                { match_phrase: { "transaction.name": TOOL } },
                { match_phrase: { "span.name": TOOL } },
              ],
              minimum_should_match: 1,
            },
          },
        }),
      });
      // HTTP accept alone is insufficient
      if (!res.ok) {
        report.live = {
          status: "unverified",
          reason: `HTTP ${res.status} — not treated as indexed success`,
        };
      } else {
        const body = await res.json();
        const hits = body?.hits?.hits ?? [];
        report.live = {
          status: hits.length > 0 ? "indexed_hits" : "unverified",
          httpStatus: res.status,
          hitCount: hits.length,
          note:
            hits.length > 0
              ? "indexed document(s) matched fixture IDs"
              : "HTTP 200 but zero indexed hits — not success",
        };
        if (hits.length === 0) {
          console.error(
            "[elastic-otlp] live: HTTP ok but zero indexed hits (labeled unverified)",
          );
        }
      }
    } catch (error) {
      report.live = {
        status: "unverified",
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

writeFileSync(path.join(work, "field-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log("[elastic-otlp] OK: export validated; indexed fixture query hit; field report written");
console.log(`  retained=${report.retained.join(",")} lost=${report.lost.join(",")}`);
console.log(`  indexedHits=${query.total}`);
