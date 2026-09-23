/**
 * Private example tooling — shared helpers for integration recipes.
 * Not a published package; not imported by root/core.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * @param {string} dir
 * @param {string} runId
 * @param {unknown[]} events
 */
export function writeJsonlFixture(dir, runId, events) {
  mkdirSync(dir, { recursive: true });
  const body = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
  writeFileSync(path.join(dir, `${runId}.jsonl`), body, "utf8");
}

/**
 * @param {string} runId
 * @param {{ toolName: string; answer: string; sourceType?: string }} opts
 */
export function buildAdapterFixtureEvents(runId, opts) {
  const startedAt = "2026-09-22T18:00:00.000Z";
  const endedAt = "2026-09-22T18:00:01.000Z";
  const source = {
    type: opts.sourceType ?? "ai-sdk",
    name: "@agent-inspect/ai-sdk",
    version: "6.31.6",
  };
  return [
    {
      schemaVersion: "1.0",
      eventId: `${runId}:run`,
      runId,
      name: runId,
      kind: "RUN",
      timestamp: startedAt,
      startedAt,
      endedAt,
      durationMs: 1000,
      status: "ok",
      confidence: "explicit",
      source,
    },
    {
      schemaVersion: "1.0",
      eventId: `${runId}:llm`,
      runId,
      parentId: `${runId}:run`,
      name: "ai-sdk-step-0",
      kind: "LLM",
      timestamp: startedAt,
      startedAt,
      endedAt,
      durationMs: 800,
      status: "ok",
      confidence: "explicit",
      source,
      attributes: { model: "fixture-generate", provider: "fixture-provider" },
      tokenUsage: { input: 4, output: 3, total: 7 },
    },
    {
      schemaVersion: "1.0",
      eventId: `${runId}:tool`,
      runId,
      parentId: `${runId}:llm`,
      name: opts.toolName,
      kind: "TOOL",
      timestamp: startedAt,
      startedAt,
      endedAt,
      durationMs: 200,
      status: "ok",
      confidence: "explicit",
      source,
      attributes: { answer: opts.answer },
    },
  ];
}

/**
 * Parse all JSON objects from a Collector file-exporter path (NDJSON or single JSON).
 * @param {string} filePath
 */
export function parseCollectorBatches(filePath) {
  const text = readFileSync(filePath, "utf8").trim();
  if (text === "") return [];

  // Prefer whole-document JSON (pretty or compact single object/array).
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // fall through to NDJSON
  }

  const batches = [];
  for (const line of text.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    batches.push(JSON.parse(trimmed));
  }
  return batches;
}

/**
 * @param {unknown} batch
 * @returns {Array<Record<string, unknown>>}
 */
export function collectSpans(batch) {
  if (!batch || typeof batch !== "object") return [];
  const resourceSpans = /** @type {{ resourceSpans?: unknown }} */ (batch).resourceSpans;
  if (!Array.isArray(resourceSpans)) return [];
  /** @type {Array<Record<string, unknown>>} */
  const spans = [];
  for (const rs of resourceSpans) {
    if (!rs || typeof rs !== "object") continue;
    const scopeSpans = /** @type {{ scopeSpans?: unknown }} */ (rs).scopeSpans;
    if (!Array.isArray(scopeSpans)) continue;
    for (const ss of scopeSpans) {
      if (!ss || typeof ss !== "object") continue;
      const list = /** @type {{ spans?: unknown }} */ (ss).spans;
      if (!Array.isArray(list)) continue;
      for (const span of list) {
        if (span && typeof span === "object") spans.push(/** @type {Record<string, unknown>} */ (span));
      }
    }
  }
  return spans;
}

/**
 * Compare expected facts against exported/collector spans.
 * @param {Array<Record<string, unknown>>} spans
 * @param {{ runId: string; toolName: string; requireNumericStatus?: boolean }} expected
 */
export function compareExpectedFacts(spans, expected) {
  /** @type {string[]} */
  const errors = [];
  if (spans.length === 0) {
    errors.push("no spans found");
    return { ok: false, errors };
  }
  const serialized = JSON.stringify(spans);
  if (!serialized.includes(expected.runId)) {
    errors.push(`missing runId ${expected.runId}`);
  }
  if (!serialized.includes(expected.toolName)) {
    errors.push(`missing tool ${expected.toolName}`);
  }
  if (expected.requireNumericStatus !== false) {
    for (const span of spans) {
      const status = span.status;
      if (!status || typeof status !== "object") {
        errors.push(`span ${String(span.name)} missing status`);
        continue;
      }
      const code = /** @type {{ code?: unknown }} */ (status).code;
      if (typeof code !== "number" || ![0, 1, 2].includes(code)) {
        errors.push(
          `span ${String(span.name)} status.code must be numeric 0/1/2, got ${JSON.stringify(code)}`,
        );
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Pick a single JSONL run by exact name attribute — never newest.
 * @param {string} traceDir
 * @param {string} runName
 */
export function selectRunIdByName(traceDir, runName) {
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
      `expected exactly one run named ${runName}, found ${matches.length}: ${matches.join(", ")}`,
    );
  }
  return matches[0];
}
