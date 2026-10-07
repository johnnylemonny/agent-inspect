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
/**
 * Read a typed OTLP AnyValue for an attribute key.
 * Integer precision is preserved as a decimal string (supports values above
 * Number.MAX_SAFE_INTEGER when the wire form is a string/bigint).
 *
 * @param {Record<string, unknown>} span
 * @param {string} key
 * @returns {{ present: false } | { present: true, kind: string, value?: string|boolean|number, detail?: string }}
 */
export function readOtlpAnyValue(span, key) {
  const attrs = span.attributes;
  if (!Array.isArray(attrs)) return { present: false };
  const matches = attrs.filter((a) => a && typeof a === "object" && a.key === key);
  if (matches.length === 0) return { present: false };
  if (matches.length > 1) {
    return {
      present: true,
      kind: "unsupported",
      detail: `duplicate attribute key (${matches.length})`,
    };
  }
  const hit = matches[0];
  const value = /** @type {{ value?: unknown }} */ (hit).value;
  if (value === undefined || value === null) {
    return { present: true, kind: "empty" };
  }
  if (typeof value === "string") {
    return { present: true, kind: "string", value };
  }
  if (typeof value !== "object") {
    return { present: true, kind: "unsupported", detail: typeof value };
  }
  const v = /** @type {Record<string, unknown>} */ (value);
  if (typeof v.stringValue === "string") {
    return { present: true, kind: "string", value: v.stringValue };
  }
  if ("intValue" in v) {
    const raw = v.intValue;
    if (typeof raw === "bigint") {
      return { present: true, kind: "int", value: raw.toString() };
    }
    if (typeof raw === "number" && Number.isInteger(raw)) {
      return { present: true, kind: "int", value: String(raw) };
    }
    if (typeof raw === "string" && /^-?\d+$/.test(raw)) {
      return { present: true, kind: "int", value: raw };
    }
    return { present: true, kind: "unsupported", detail: "intValue" };
  }
  if ("boolValue" in v) {
    return { present: true, kind: "bool", value: Boolean(v.boolValue) };
  }
  if (typeof v.doubleValue === "number") {
    return { present: true, kind: "double", value: v.doubleValue };
  }
  if (typeof v.bytesValue === "string") {
    return { present: true, kind: "bytes", value: v.bytesValue };
  }
  if (v.arrayValue && typeof v.arrayValue === "object") {
    return {
      present: true,
      kind: "array",
      value: JSON.stringify(v.arrayValue),
    };
  }
  if (v.kvlistValue && typeof v.kvlistValue === "object") {
    return {
      present: true,
      kind: "kvlist",
      value: JSON.stringify(v.kvlistValue),
    };
  }
  return {
    present: true,
    kind: "unsupported",
    detail: Object.keys(v).sort().join(",") || "empty-object",
  };
}

/**
 * Read an OTLP attribute stringValue (or string) from a span.
 * Prefer {@link readOtlpAnyValue} when comparing selected typed fields.
 * @param {Record<string, unknown>} span
 * @param {string} key
 */
export function otlpAttrString(span, key) {
  const typed = readOtlpAnyValue(span, key);
  if (!typed.present || typed.kind !== "string") return undefined;
  return /** @type {string} */ (typed.value);
}

/**
 * Default selected semantic fields for AgentInspect OTLP transport recipes.
 * Absent vs transformed are distinct failures.
 */
export const DEFAULT_SELECTED_OTLP_FIELDS = Object.freeze([
  "agent_inspect.run_id",
  "agent_inspect.source.type",
  "gen_ai.request.model",
]);

/**
 * Compare selected OTLP attributes on identity-matched spans.
 * Distinguishes missing destination attribute from transformed value.
 *
 * @param {Array<Record<string, unknown>>} expectedSpans
 * @param {Array<Record<string, unknown>>} destinationSpans
 * @param {{ attributeKeys?: string[]; requireToolName?: string; requireNumericStatus?: boolean }} [opts]
 */
export function compareSelectedSpanFields(expectedSpans, destinationSpans, opts = {}) {
  /** @type {string[]} */
  const errors = [];
  const keys = opts.attributeKeys ?? [...DEFAULT_SELECTED_OTLP_FIELDS];
  const expected = new Map();
  for (const span of expectedSpans) {
    expected.set(spanIdentityKey(span), span);
  }
  const observed = new Map();
  for (const span of destinationSpans) {
    observed.set(spanIdentityKey(span), span);
  }

  for (const [id, exp] of expected) {
    const got = observed.get(id);
    if (got === undefined) {
      errors.push(`missing destination span ${id} for selected-field compare`);
      continue;
    }
    for (const key of keys) {
      const expVal = readOtlpAnyValue(exp, key);
      // Policy: compare a selected key only when the expected span emits it.
      // Missing-on-source is not a destination retention claim for that span.
      if (!expVal.present) continue;
      if (expVal.kind === "unsupported" || expVal.kind === "empty") {
        errors.push(
          `span ${id} source attribute ${key} unsupported selected type (${expVal.detail ?? expVal.kind})`,
        );
        continue;
      }
      const gotVal = readOtlpAnyValue(got, key);
      if (!gotVal.present) {
        errors.push(`span ${id} missing attribute ${key}`);
        continue;
      }
      if (gotVal.kind === "unsupported" || gotVal.kind === "empty") {
        errors.push(
          `span ${id} attribute ${key} unsupported selected type (${gotVal.detail ?? gotVal.kind})`,
        );
        continue;
      }
      if (expVal.kind !== gotVal.kind) {
        errors.push(
          `span ${id} attribute ${key} type changed: expected ${expVal.kind} got ${gotVal.kind}`,
        );
      } else if (expVal.value !== gotVal.value) {
        errors.push(
          `span ${id} attribute ${key} transformed: expected ${String(expVal.value)} got ${String(gotVal.value)}`,
        );
      }
    }
    if (opts.requireNumericStatus !== false) {
      const code = /** @type {{ code?: unknown } | undefined} */ (got.status)?.code;
      if (typeof code !== "number" || ![0, 1, 2].includes(code)) {
        errors.push(`span ${id} status.code must be numeric 0/1/2`);
      }
    }
  }

  if (opts.requireToolName) {
    const toolOk = destinationSpans.some((s) => String(s.name ?? "") === opts.requireToolName);
    if (!toolOk) {
      errors.push(`missing tool span name ${opts.requireToolName}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    comparedKeys: [...keys],
  };
}

/**
 * Merge OTLP batches (JSON or NDJSON parses) into a single resourceSpans document
 * suitable for `agent-inspect open --format otlp-json`.
 * @param {unknown[]} batches
 */
export function mergeOtlpBatchesToDocument(batches) {
  /** @type {unknown[]} */
  const resourceSpans = [];
  for (const batch of batches) {
    if (!batch || typeof batch !== "object") continue;
    const rs = /** @type {{ resourceSpans?: unknown }} */ (batch).resourceSpans;
    if (Array.isArray(rs)) {
      for (const item of rs) resourceSpans.push(item);
    }
  }
  return { resourceSpans };
}

/**
 * Compare expected facts against exported/collector spans.
 * Prefer {@link compareSelectedSpanFields} for transport recipes; this helper
 * remains for coarse offline checks and still requires structured presence.
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
  const runOk = spans.some((s) => otlpAttrString(s, "agent_inspect.run_id") === expected.runId);
  if (!runOk && !JSON.stringify(spans).includes(expected.runId)) {
    errors.push(`missing runId ${expected.runId}`);
  } else if (!runOk) {
    // Substring-only presence is not enough for semantic runId.
    errors.push(`missing attribute agent_inspect.run_id=${expected.runId}`);
  }
  if (!spans.some((s) => String(s.name ?? "") === expected.toolName)) {
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
