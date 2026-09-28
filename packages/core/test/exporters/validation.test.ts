import { describe, expect, it } from "vitest";

import { validateExportContent } from "../../src/exporters/validation.js";

describe("validateExportContent", () => {
  it("validates markdown", () => {
    const r = validateExportContent("markdown", "# AgentInspect Run: x\n");
    expect(r.ok).toBe(true);
  });

  it("rejects bad markdown prefix", () => {
    const r = validateExportContent("markdown", "## nope");
    expect(r.ok).toBe(false);
  });

  it("validates html", () => {
    const r = validateExportContent(
      "html",
      "<!doctype html><html><head></head><body>x</body></html>",
    );
    expect(r.ok).toBe(true);
  });

  it("rejects script in html", () => {
    const r = validateExportContent("html", "<!doctype html><script>x</script>");
    expect(r.ok).toBe(false);
  });

  it("validates openinference JSON", () => {
    const j = JSON.stringify({
      format: "openinference",
      spans: [],
    });
    const r = validateExportContent("openinference", j);
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => /experimental/i.test(w))).toBe(true);
  });

  it("invalid JSON fails openinference", () => {
    const r = validateExportContent("openinference", "{");
    expect(r.ok).toBe(false);
  });

  it("validates otlp-json", () => {
    const j = JSON.stringify({ resourceSpans: [] });
    const r = validateExportContent("otlp-json", j);
    expect(r.ok).toBe(true);
  });

  it("rejects invalid hex ids and reversed times (producer profile)", () => {
    const j = JSON.stringify({
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  traceId: "not-hex",
                  spanId: "short",
                  name: "x",
                  startTimeUnixNano: "200",
                  endTimeUnixNano: "100",
                  status: { code: 1 },
                  attributes: [
                    {
                      key: "bad",
                      value: { intValue: "1.5", stringValue: "x" },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const r = validateExportContent("otlp-json", j);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /traceId/.test(e))).toBe(true);
    expect(r.errors.some((e) => /spanId/.test(e))).toBe(true);
    expect(r.errors.some((e) => /endTimeUnixNano/.test(e))).toBe(true);
    expect(r.errors.some((e) => /AnyValue must set exactly one variant/.test(e))).toBe(
      true,
    );
  });

  it("rejects out-of-bounds timestamps, string bool, and nested fractional int", () => {
    const j = JSON.stringify({
      resourceSpans: [
        {
          resource: {
            attributes: [
              {
                key: "svc",
                value: {
                  kvlistValue: {
                    values: [
                      {
                        key: "nested",
                        value: { intValue: "1.25" },
                      },
                    ],
                  },
                },
              },
            ],
          },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: "a".repeat(32),
                  spanId: "b".repeat(16),
                  name: "x",
                  startTimeUnixNano: "18446744073709551616",
                  endTimeUnixNano: "1",
                  status: { code: 0 },
                  attributes: [{ key: "flag", value: { boolValue: "true" } }],
                  events: [
                    {
                      timeUnixNano: "-1",
                      attributes: [{ key: "e", value: { intValue: "1" } }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const r = validateExportContent("otlp-json", j);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /startTimeUnixNano/.test(e))).toBe(true);
    expect(r.errors.some((e) => /boolValue/.test(e))).toBe(true);
    expect(r.errors.some((e) => /intValue/.test(e))).toBe(true);
    expect(r.errors.some((e) => /timeUnixNano/.test(e))).toBe(true);
  });

  it("accepts exact uint64/int64 bounds and recursive kvlist", () => {
    const j = JSON.stringify({
      resourceSpans: [
        {
          resource: {
            attributes: [
              {
                key: "meta",
                value: {
                  kvlistValue: {
                    values: [{ key: "n", value: { intValue: "-9223372036854775808" } }],
                  },
                },
              },
            ],
          },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: "a".repeat(32),
                  spanId: "b".repeat(16),
                  name: "ok",
                  startTimeUnixNano: "0",
                  endTimeUnixNano: "18446744073709551615",
                  status: { code: 1 },
                  attributes: [{ key: "hi", value: { intValue: "9223372036854775807" } }],
                },
              ],
            },
          ],
        },
      ],
    });
    const r = validateExportContent("otlp-json", j);
    expect(r.ok).toBe(true);
  });
});
