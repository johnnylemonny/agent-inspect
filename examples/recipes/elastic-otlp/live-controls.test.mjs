/**
 * Controlled Elastic live-path false-green regressions (no real Elastic).
 * Preload injects HTTP stubs via globalThis.__agentInspectElasticStub.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const verifyPath = path.join(__dirname, "verify.mjs");
const preloadPath = path.join(__dirname, "live-stub-preload.mjs");

function runLiveStub(mode) {
  return spawnSync(process.execPath, ["--import", preloadPath, verifyPath, "--live"], {
    encoding: "utf8",
    cwd: __dirname,
    env: {
      ...process.env,
      AGENT_INSPECT_ELASTIC_STUB: "1",
      AGENT_INSPECT_ELASTIC_STUB_MODE: mode,
      ELASTIC_URL: "http://elastic.stub.invalid",
      ELASTIC_API_KEY: "stub-key",
      ELASTIC_OTLP_URL: "http://otlp.stub.invalid",
    },
  });
}

describe("elastic live-path stub controls", () => {
  it("rejects OTLP send with rejectedSpans>0", () => {
    const result = runLiveStub("reject-send");
    assert.notEqual(result.status, 0);
    assert.match(`${result.stderr}\n${result.stdout}`, /rejectedSpans|partial rejection/i);
  });

  it("rejects trace-id-only indexed hits without span identities", () => {
    const result = runLiveStub("trace-id-only");
    assert.notEqual(result.status, 0);
    assert.match(
      `${result.stderr}\n${result.stdout}`,
      /incomplete|missingSpanIds|identity comparison|selected-field/i,
    );
  });
});
