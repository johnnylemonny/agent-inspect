import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../..");
const indexCjs = path.join(repoRoot, "packages/core/dist/index.cjs");
const advancedCjs = path.join(repoRoot, "packages/core/dist/advanced.cjs");
const distPresent = existsSync(indexCjs) && existsSync(advancedCjs);

describe.skipIf(!distPresent)("packed CJS root/advanced context identity", () => {
  it("shares AsyncLocalStorage across separately required entrypoints", () => {
    const script = `
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const root = require(${JSON.stringify(indexCjs)});
const advanced = require(${JSON.stringify(advancedCjs)});
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-dist-ctx-"));
root.inspectRun({ name: "dist-context", dir, silent: true }, async () => {
  if (!advanced.hasActiveContext()) throw new Error("advanced.hasActiveContext false");
  if (root.getCurrentRunId && root.getCurrentRunId() !== advanced.getCurrentRunId()) {
    throw new Error("runId mismatch across entrypoints");
  }
  await root.step("inner", async () => {
    if (!advanced.hasActiveContext()) throw new Error("lost in step");
  });
}).then(() => {
  fs.rmSync(dir, { recursive: true, force: true });
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
`;
    const result = spawnSync(process.execPath, ["-e", script], {
      encoding: "utf-8",
      cwd: mkdtempSync(path.join(tmpdir(), "ai-ctx-test-")),
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it("keeps createInspector instances isolated from global context", () => {
    const script = `
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const root = require(${JSON.stringify(indexCjs)});
const advanced = require(${JSON.stringify(advancedCjs)});
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-iso-ctx-"));
const inspector = advanced.createInspector({ name: "iso", dir, silent: true });
inspector.run("iso-run", async () => {
  if (advanced.hasActiveContext()) throw new Error("inspector populated global ALS");
  if (root.getCurrentRunId && root.getCurrentRunId() !== undefined) {
    throw new Error("root saw inspector run id");
  }
}).then(() => {
  fs.rmSync(dir, { recursive: true, force: true });
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
`;
    const work = mkdtempSync(path.join(tmpdir(), "ai-iso-test-"));
    try {
      const result = spawnSync(process.execPath, ["-e", script], {
        encoding: "utf-8",
        cwd: work,
      });
      expect(result.status, result.stderr || result.stdout).toBe(0);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
