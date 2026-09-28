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

/**
 * Flatten OTLP resourceSpans documents into span records with resource/scope context.
 * @param {unknown[]} batches
 */
export function normalizeOtlpBatches(batches) {
  /** @type {Array<Record<string, unknown>>} */
  const out = [];
  for (const batch of batches) {
    if (!batch || typeof batch !== "object") continue;
    const resourceSpans = /** @type {{ resourceSpans?: unknown }} */ (batch).resourceSpans;
    if (!Array.isArray(resourceSpans)) continue;
    for (const rs of resourceSpans) {
      if (!rs || typeof rs !== "object") continue;
      const resource = /** @type {{ resource?: unknown }} */ (rs).resource;
      const scopeSpans = /** @type {{ scopeSpans?: unknown }} */ (rs).scopeSpans;
      if (!Array.isArray(scopeSpans)) continue;
      for (const ss of scopeSpans) {
        if (!ss || typeof ss !== "object") continue;
        const scope = /** @type {{ scope?: unknown }} */ (ss).scope;
        const list = /** @type {{ spans?: unknown }} */ (ss).spans;
        if (!Array.isArray(list)) continue;
        for (const span of list) {
          if (!span || typeof span !== "object") continue;
          out.push({
            .../** @type {Record<string, unknown>} */ (span),
            __resource: resource ?? null,
            __scope: scope ?? null,
          });
        }
      }
    }
  }
  return out;
}

/**
 * @param {Record<string, unknown>} span
 */
export function spanIdentityKey(span) {
  return `${String(span.traceId ?? "")}:${String(span.spanId ?? "")}`;
}

/**
 * Digest of expected span identities for an invocation (stable sort).
 * @param {Array<Record<string, unknown>>} spans
 */
export function expectedSpanDigest(spans) {
  const keys = spans.map(spanIdentityKey).sort();
  return keys.join("|");
}

/**
 * Exact transport comparator keyed by (traceId, spanId).
 * Does not treat word overlap as identity. Does not substitute expected for missing destination.
 *
 * @param {Array<Record<string, unknown>>} expectedSpans
 * @param {Array<Record<string, unknown>>} destinationSpans
 * @param {{ selectedTraceId?: string; invocationId?: string }} [opts]
 */
export function compareTransportSpans(expectedSpans, destinationSpans, opts = {}) {
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  const selectedTraceId = opts.selectedTraceId;

  const expected = new Map();
  for (const span of expectedSpans) {
    const key = spanIdentityKey(span);
    if (expected.has(key)) {
      errors.push(`duplicate expected identity ${key}`);
    }
    expected.set(key, span);
  }

  /** @type {Map<string, Record<string, unknown>>} */
  const observed = new Map();
  /** @type {Array<Record<string, unknown>>} */
  const outsideSelected = [];
  for (const span of destinationSpans) {
    const key = spanIdentityKey(span);
    if (
      selectedTraceId !== undefined &&
      String(span.traceId ?? "") !== selectedTraceId
    ) {
      outsideSelected.push(span);
      continue;
    }
    if (observed.has(key)) {
      errors.push(`duplicate destination identity ${key}`);
    }
    observed.set(key, span);
  }

  for (const [key, exp] of expected) {
    const got = observed.get(key);
    if (got === undefined) {
      errors.push(`missing destination span ${key}`);
      continue;
    }
    if (String(got.name ?? "") !== String(exp.name ?? "")) {
      errors.push(`span ${key} name mismatch: expected ${String(exp.name)} got ${String(got.name)}`);
    }
    const expParent = exp.parentSpanId === undefined || exp.parentSpanId === ""
      ? ""
      : String(exp.parentSpanId);
    const gotParent = got.parentSpanId === undefined || got.parentSpanId === ""
      ? ""
      : String(got.parentSpanId);
    if (expParent !== gotParent) {
      errors.push(`span ${key} parent mismatch`);
    }
    if (String(exp.startTimeUnixNano ?? "") !== String(got.startTimeUnixNano ?? "")) {
      // Exact integer string compare via BigInt when both decimal.
      const a = String(exp.startTimeUnixNano ?? "");
      const b = String(got.startTimeUnixNano ?? "");
      if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
        if (BigInt(a) !== BigInt(b)) {
          errors.push(`span ${key} startTimeUnixNano mismatch`);
        }
      } else if (a !== b) {
        errors.push(`span ${key} startTimeUnixNano mismatch`);
      }
    }
    if (
      exp.endTimeUnixNano !== undefined &&
      String(exp.endTimeUnixNano) !== String(got.endTimeUnixNano ?? "")
    ) {
      const a = String(exp.endTimeUnixNano);
      const b = String(got.endTimeUnixNano ?? "");
      if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
        if (BigInt(a) !== BigInt(b)) {
          errors.push(`span ${key} endTimeUnixNano mismatch`);
        }
      } else {
        errors.push(`span ${key} endTimeUnixNano mismatch`);
      }
    }
    const expStatus = /** @type {{ code?: unknown } | undefined} */ (exp.status)?.code;
    const gotStatus = /** @type {{ code?: unknown } | undefined} */ (got.status)?.code;
    if (expStatus !== undefined && expStatus !== gotStatus) {
      errors.push(`span ${key} status.code mismatch`);
    }
  }

  for (const key of observed.keys()) {
    if (!expected.has(key)) {
      errors.push(`unexpected destination span ${key}`);
    }
  }

  if (outsideSelected.length > 0) {
    warnings.push(
      `${outsideSelected.length} span(s) outside selected trace ${selectedTraceId ?? "(none)"} — reported, not compared as children`,
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    expectedDigest: expectedSpanDigest(expectedSpans),
    invocationId: opts.invocationId ?? null,
    outsideSelectedCount: outsideSelected.length,
  };
}
