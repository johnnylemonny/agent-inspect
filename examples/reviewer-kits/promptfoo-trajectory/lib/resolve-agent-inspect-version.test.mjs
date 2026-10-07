import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { resolveAgentInspectVersion } from "./resolve-agent-inspect-version.mjs";

describe("resolveAgentInspectVersion", () => {
  it("reports configured pin and resolved installed version separately", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ai-kit-pin-"));
    try {
      writeFileSync(
        path.join(root, "package.json"),
        JSON.stringify({
          dependencies: { "agent-inspect": "6.31.16" },
        }),
      );
      const fixturePkg = path.join(root, "installed", "package.json");
      mkdirSync(path.dirname(fixturePkg), { recursive: true });
      writeFileSync(
        fixturePkg,
        JSON.stringify({ name: "agent-inspect", version: "6.31.17" }),
      );
      const result = resolveAgentInspectVersion({
        kitRoot: root,
        requireResolve: () => fixturePkg,
      });
      assert.equal(result.configured, "6.31.16");
      assert.equal(result.resolved, "6.31.17");
      assert.equal(result.ok, false);
      assert.match(result.failures.join(" "), /6\.31\.16.*6\.31\.17/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("passes when exact pin matches resolved version", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ai-kit-pin-ok-"));
    try {
      writeFileSync(
        path.join(root, "package.json"),
        JSON.stringify({
          dependencies: { "agent-inspect": "6.31.17" },
        }),
      );
      const fixturePkg = path.join(root, "installed", "package.json");
      mkdirSync(path.dirname(fixturePkg), { recursive: true });
      writeFileSync(
        fixturePkg,
        JSON.stringify({ name: "agent-inspect", version: "6.31.17" }),
      );
      const result = resolveAgentInspectVersion({
        kitRoot: root,
        requireResolve: () => fixturePkg,
      });
      assert.equal(result.ok, true, result.failures.join("; "));
      assert.equal(result.resolved, "6.31.17");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
