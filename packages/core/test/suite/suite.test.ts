import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  loadSuiteConfig,
  normalizeSuiteConfig,
  renderSuiteReportMarkdown,
  runSuite,
  validateSuiteConfig,
} from "../../src/suite/index.js";

describe("trace suite config", () => {
  it("normalizes a valid config object", () => {
    const config = normalizeSuiteConfig({
      name: "demo",
      traces: "./traces",
      cases: [{ id: "basic", runId: "basic-run" }],
    });
    expect(config.name).toBe("demo");
    expect(config.cases).toHaveLength(1);
  });

  it("rejects duplicate case ids", () => {
    expect(() =>
      normalizeSuiteConfig({
        name: "demo",
        traces: "./traces",
        cases: [
          { id: "dup", runId: "a" },
          { id: "dup", runId: "b" },
        ],
      }),
    ).toThrow(/Duplicate case id/);
  });

  it("loads JSON config from disk", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "suite-load-"));
    try {
      const configPath = path.join(dir, "agent-inspect.suite.json");
      await writeFile(
        configPath,
        JSON.stringify({
          name: "disk-suite",
          traces: ".",
          cases: [{ id: "case-1" }],
        }),
        "utf-8",
      );
      const loaded = await loadSuiteConfig({ configPath });
      expect(loaded.config.name).toBe("disk-suite");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("validates traces directory existence", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "suite-validate-"));
    try {
      const tracesDir = path.join(dir, "traces");
      await mkdir(tracesDir, { recursive: true });
      const config = normalizeSuiteConfig({
        name: "valid",
        traces: "./traces",
        cases: [{ id: "case-1" }],
      });
      const result = await validateSuiteConfig(config, { configDir: dir });
      expect(result.ok).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs suite checks against outcome-mixed fixture", async () => {
    const repoRoot = path.resolve(import.meta.dirname, "../../../..");
    const configPath = path.join(repoRoot, "fixtures/configs/outcome-suite.suite.json");
    const result = await runSuite({ configPath });
    expect(result.suiteName).toBe("outcome-suite");
    expect(result.cases).toHaveLength(1);
    expect(result.cases[0]?.status).toBe("pass");
    expect(result.ok).toBe(true);
    const markdown = renderSuiteReportMarkdown(result);
    expect(markdown).toContain("outcome-pass");
    expect(markdown).toContain("PASS");
  });
});

describe("suite assertion integrity", () => {
  const repoRoot = path.resolve(import.meta.dirname, "../../../..");
  const tracesDir = path.join(repoRoot, "fixtures/traces");

  async function writeSuiteConfig(
    dir: string,
    config: Record<string, unknown>,
  ): Promise<string> {
    const configPath = path.join(dir, "agent-inspect.suite.json");
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
    return configPath;
  }

  it("fails closed when a case declares no effective assertions", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "suite-no-assert-"));
    try {
      const configPath = await writeSuiteConfig(dir, {
        name: "no-assertions",
        traces: tracesDir,
        cases: [{ id: "bare", runId: "minimal-success" }],
      });
      const result = await runSuite({ configPath });
      expect(result.ok).toBe(false);
      expect(result.status).toBe("error");
      expect(result.cases[0]?.status).toBe("error");
      expect(result.cases[0]?.diagnostics.some((d) => d.code === "AI_SUITE_NO_ASSERTIONS")).toBe(
        true,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails closed on unknown-only selectors", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "suite-unknown-select-"));
    try {
      const configPath = await writeSuiteConfig(dir, {
        name: "unknown-select",
        traces: tracesDir,
        checks: { select: ["run.sttaus"] },
        cases: [{ id: "typo", runId: "minimal-success" }],
      });
      const result = await runSuite({ configPath });
      expect(result.ok).toBe(false);
      expect(result.status).toBe("error");
      expect(result.cases[0]?.diagnostics.some((d) => d.code === "AI_SUITE_UNKNOWN_SELECTOR")).toBe(
        true,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("passes known run.status on a success trace", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "suite-status-ok-"));
    try {
      const configPath = await writeSuiteConfig(dir, {
        name: "status-ok",
        traces: tracesDir,
        checks: { select: ["run.status"] },
        cases: [{ id: "ok", runId: "minimal-success" }],
      });
      const result = await runSuite({ configPath });
      expect(result.ok).toBe(true);
      expect(result.cases[0]?.status).toBe("pass");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects known + unknown selector combinations", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "suite-mixed-select-"));
    try {
      const configPath = await writeSuiteConfig(dir, {
        name: "mixed-select",
        traces: tracesDir,
        checks: { select: ["run.status", "run.sttaus"] },
        cases: [{ id: "mixed", runId: "minimal-success" }],
      });
      const result = await runSuite({ configPath });
      expect(result.ok).toBe(false);
      expect(result.status).toBe("error");
      expect(result.cases[0]?.diagnostics.some((d) => d.code === "AI_SUITE_UNKNOWN_SELECTOR")).toBe(
        true,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("honors eval.requireSuccess on an error trace", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "suite-require-success-"));
    try {
      const configPath = await writeSuiteConfig(dir, {
        name: "require-success",
        traces: tracesDir,
        eval: { requireSuccess: true },
        cases: [{ id: "error-run", runId: "minimal-error" }],
      });
      const result = await runSuite({ configPath });
      expect(result.ok).toBe(false);
      expect(result.cases[0]?.status).toBe("fail");
      expect(result.cases[0]?.checkOk).toBe(false);
      expect(result.cases[0]?.evalOk).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails run.status on the same error trace", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "suite-status-error-"));
    try {
      const configPath = await writeSuiteConfig(dir, {
        name: "status-error",
        traces: tracesDir,
        checks: { select: ["run.status"] },
        cases: [{ id: "error-run", runId: "minimal-error" }],
      });
      const result = await runSuite({ configPath });
      expect(result.ok).toBe(false);
      expect(result.cases[0]?.status).toBe("fail");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("preserves observation-only positive and negative controls", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "suite-obs-only-"));
    try {
      const passPath = await writeSuiteConfig(dir, {
        name: "obs-pass",
        traces: tracesDir,
        cases: [
          {
            id: "present",
            runId: "outcome-pass",
            expectedObservations: ["policyShown"],
          },
        ],
      });
      const pass = await runSuite({ configPath: passPath });
      expect(pass.ok).toBe(true);
      expect(pass.cases[0]?.status).toBe("pass");

      const failPath = await writeSuiteConfig(dir, {
        name: "obs-fail",
        traces: tracesDir,
        cases: [
          {
            id: "missing",
            runId: "minimal-success",
            expectedObservations: ["policyShown"],
          },
        ],
      });
      const fail = await runSuite({ configPath: failPath });
      expect(fail.ok).toBe(false);
      expect(fail.cases[0]?.status).toBe("fail");
      expect(
        fail.cases[0]?.diagnostics.some((d) => d.code === "AI_SUITE_CASE_OBSERVATION_FAILED"),
      ).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails a mixed suite containing an unasserted case", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "suite-mixed-cases-"));
    try {
      const configPath = await writeSuiteConfig(dir, {
        name: "mixed-unasserted",
        traces: tracesDir,
        cases: [
          {
            id: "asserted",
            runId: "outcome-pass",
            expectedObservations: ["policyShown"],
          },
          { id: "bare", runId: "minimal-success" },
        ],
      });
      const result = await runSuite({ configPath });
      expect(result.ok).toBe(false);
      expect(result.cases.find((c) => c.id === "asserted")?.status).toBe("pass");
      expect(result.cases.find((c) => c.id === "bare")?.status).toBe("error");
      expect(
        result.cases
          .find((c) => c.id === "bare")
          ?.diagnostics.some((d) => d.code === "AI_SUITE_NO_ASSERTIONS"),
      ).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
