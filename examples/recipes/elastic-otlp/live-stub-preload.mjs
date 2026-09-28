/**
 * Preload for elastic-otlp live stub controls.
 * AGENT_INSPECT_ELASTIC_STUB_MODE:
 *   reject-send — HTTP 200 body with rejectedSpans:3
 *   trace-id-only — search hits with only trace.id
 */
const mode = process.env.AGENT_INSPECT_ELASTIC_STUB_MODE ?? "reject-send";

globalThis.__agentInspectElasticStub = async (url) => {
  const u = String(url);
  if (u.includes("/v1/traces")) {
    if (mode === "reject-send") {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ partialSuccess: { rejectedSpans: 3 } }),
        json: async () => ({ partialSuccess: { rejectedSpans: 3 } }),
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({}),
    };
  }
  if (u.includes("/_search")) {
    if (mode === "trace-id-only") {
      // Provide a placeholder id; verifier will fail because span ids are absent.
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            hits: {
              hits: [{ _source: { trace: { id: "deadbeef".repeat(4) } } }],
            },
          }),
        json: async () => ({
          hits: {
            hits: [{ _source: { trace: { id: "deadbeef".repeat(4) } } }],
          },
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ hits: { hits: [] } }),
      json: async () => ({ hits: { hits: [] } }),
    };
  }
  return {
    ok: false,
    status: 404,
    text: async () => "not found",
    json: async () => ({ error: "not found" }),
  };
};
