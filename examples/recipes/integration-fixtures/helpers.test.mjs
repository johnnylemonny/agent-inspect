import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compareSelectedSpanFields,
  compareTransportSpans,
  expectedSpanDigest,
  mergeOtlpBatchesToDocument,
  normalizeOtlpBatches,
  otlpAttrString,
  spanIdentityKey,
} from "./helpers.mjs";

function span(partial) {
  return {
    traceId: "a".repeat(32),
    spanId: "b".repeat(16),
    name: "root",
    startTimeUnixNano: "1000",
    endTimeUnixNano: "2000",
    status: { code: 1 },
    attributes: [
      { key: "agent_inspect.run_id", value: { stringValue: "run_x" } },
      { key: "agent_inspect.source.type", value: { stringValue: "ai-sdk" } },
      { key: "gen_ai.request.model", value: { stringValue: "fixture-generate" } },
    ],
    ...partial,
  };
}

describe("compareTransportSpans", () => {
  it("rejects a word-filled fabricated span that lacks expected identities", () => {
    const expected = [
      span({ spanId: "1".repeat(16), name: "run" }),
      span({ spanId: "2".repeat(16), name: "llm", parentSpanId: "1".repeat(16) }),
      span({ spanId: "3".repeat(16), name: "tool", parentSpanId: "2".repeat(16) }),
    ];
    const destination = [
      span({
        spanId: "f".repeat(16),
        name: "run llm tool fixture-search",
      }),
    ];
    const result = compareTransportSpans(expected, destination);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /missing destination span/.test(e)));
  });

  it("keeps same spanId in different traces distinct", () => {
    const expected = [span({ traceId: "a".repeat(32), spanId: "1".repeat(16) })];
    const destination = [span({ traceId: "c".repeat(32), spanId: "1".repeat(16) })];
    const result = compareTransportSpans(expected, destination);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /missing destination span a{32}:1{16}/.test(e)));
  });

  it("fails wrong parent, name, and timestamp", () => {
    const expected = [
      span({ spanId: "1".repeat(16), name: "child", parentSpanId: "9".repeat(16), startTimeUnixNano: "10" }),
    ];
    const destination = [
      span({
        spanId: "1".repeat(16),
        name: "other",
        parentSpanId: "8".repeat(16),
        startTimeUnixNano: "11",
      }),
    ];
    const result = compareTransportSpans(expected, destination);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /name mismatch/.test(e)));
    assert.ok(result.errors.some((e) => /parent mismatch/.test(e)));
    assert.ok(result.errors.some((e) => /startTimeUnixNano/.test(e)));
  });

  it("reports outside-selected traces without treating them as unexplained children", () => {
    const expected = [span({ traceId: "a".repeat(32), spanId: "1".repeat(16) })];
    const destination = [
      span({ traceId: "a".repeat(32), spanId: "1".repeat(16) }),
      span({ traceId: "d".repeat(32), spanId: "2".repeat(16), name: "other-run" }),
    ];
    const result = compareTransportSpans(expected, destination, {
      selectedTraceId: "a".repeat(32),
    });
    assert.equal(result.ok, true);
    assert.equal(result.outsideSelectedCount, 1);
    assert.ok(result.warnings.length >= 1);
  });

  it("passes matching multi-batch normalized input", () => {
    const s1 = span({ spanId: "1".repeat(16), name: "a" });
    const s2 = span({ spanId: "2".repeat(16), name: "b", parentSpanId: "1".repeat(16) });
    const batches = [
      { resourceSpans: [{ scopeSpans: [{ spans: [s1] }] }] },
      { resourceSpans: [{ scopeSpans: [{ spans: [s2] }] }] },
    ];
    const normalized = normalizeOtlpBatches(batches);
    assert.equal(normalized.length, 2);
    const result = compareTransportSpans([s1, s2], normalized);
    assert.equal(result.ok, true);
    assert.equal(result.expectedDigest, expectedSpanDigest([s1, s2]));
  });

  it("detects duplicate destination delivery", () => {
    const s = span({ spanId: "1".repeat(16) });
    const result = compareTransportSpans([s], [s, { ...s }]);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /duplicate destination/.test(e)));
  });
});

describe("spanIdentityKey", () => {
  it("joins trace and span ids", () => {
    assert.equal(spanIdentityKey({ traceId: "aa", spanId: "bb" }), "aa:bb");
  });
});

describe("compareSelectedSpanFields", () => {
  it("fails when selected attributes are missing on destination", () => {
    const expected = [span({ spanId: "1".repeat(16), name: "llm" })];
    const destination = [
      span({
        spanId: "1".repeat(16),
        name: "llm",
        attributes: [{ key: "agent_inspect.run_id", value: { stringValue: "run_x" } }],
      }),
    ];
    const result = compareSelectedSpanFields(expected, destination, {
      requireToolName: undefined,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /missing attribute agent_inspect.source.type/.test(e)));
    assert.ok(result.errors.some((e) => /missing attribute gen_ai.request.model/.test(e)));
  });

  it("fails when selected attributes are transformed", () => {
    const expected = [span({ spanId: "1".repeat(16) })];
    const destination = [
      span({
        spanId: "1".repeat(16),
        attributes: [
          { key: "agent_inspect.run_id", value: { stringValue: "run_x" } },
          { key: "agent_inspect.source.type", value: { stringValue: "ai-sdk" } },
          { key: "gen_ai.request.model", value: { stringValue: "other-model" } },
        ],
      }),
    ];
    const result = compareSelectedSpanFields(expected, destination);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /gen_ai.request.model transformed/.test(e)));
  });

  it("passes matching selected attributes and tool name", () => {
    const expected = [
      span({ spanId: "1".repeat(16), name: "llm" }),
      span({ spanId: "2".repeat(16), name: "lookup_orders" }),
    ];
    const result = compareSelectedSpanFields(expected, expected, {
      requireToolName: "lookup_orders",
    });
    assert.equal(result.ok, true, result.errors.join("; "));
  });
});

describe("mergeOtlpBatchesToDocument", () => {
  it("merges multi-batch NDJSON into one openable document", () => {
    const s1 = span({ spanId: "1".repeat(16), name: "a" });
    const s2 = span({ spanId: "2".repeat(16), name: "b" });
    const batches = [
      { resourceSpans: [{ scopeSpans: [{ spans: [s1] }] }] },
      { resourceSpans: [{ scopeSpans: [{ spans: [s2] }] }] },
    ];
    const doc = mergeOtlpBatchesToDocument(batches);
    assert.equal(doc.resourceSpans.length, 2);
    const normalized = normalizeOtlpBatches([doc]);
    assert.equal(normalized.length, 2);
  });
});

describe("otlpAttrString", () => {
  it("reads stringValue attributes", () => {
    assert.equal(
      otlpAttrString(span({}), "agent_inspect.run_id"),
      "run_x",
    );
  });
});
