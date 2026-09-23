import { describe, expect, it } from "vitest";
import {
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const syncScript = path.join(repoRoot, "scripts/sync-public-truth.mjs");
const publicTruthCheck = path.join(repoRoot, "scripts/validate-public-truth.mjs");
const digestLib = path.join(repoRoot, "scripts/lib/claim-content-digest.mjs");
const demoVerify = path.join(repoRoot, "scripts/demo-verify.mjs");

describe("public-truth sync and claim digest", () => {
  it("computes a stable claim digest that ignores mechanical version numbers", async () => {
    const { computeClaimContentDigest } = await import(digestLib);
    const a = computeClaimContentDigest({
      allowedClaims: ["Current published baseline 6.17.3, schema 1.0, Node.js >=20, MIT"],
      bannedPhrases: ["waiting for adoption"],
    });
    const b = computeClaimContentDigest({
      allowedClaims: ["Current published baseline 6.17.4, schema 1.0, Node.js >=20, MIT"],
      bannedPhrases: ["waiting for adoption"],
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);

    const c = computeClaimContentDigest({
      allowedClaims: ["Different claim"],
      bannedPhrases: ["waiting for adoption"],
    });
    expect(c).not.toBe(a);
  });

  it("synchronizes mechanical surfaces to the root package version and is idempotent", () => {
    const first = spawnSync(process.execPath, [syncScript], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(first.status, first.stderr || first.stdout).toBe(0);

    const pkgVersion = JSON.parse(
      readFileSync(path.join(repoRoot, "package.json"), "utf8"),
    ).version as string;
    const facts = JSON.parse(
      readFileSync(path.join(repoRoot, "docs/product/PUBLIC-PRODUCT-FACTS.json"), "utf8"),
    ) as { version: string; statusLine: string };
    expect(facts.version).toBe(pkgVersion);
    expect(facts.statusLine).toContain(pkgVersion);

    const ledger = JSON.parse(
      readFileSync(path.join(repoRoot, "docs/product/PUBLIC-CLAIM-LEDGER.json"), "utf8"),
    ) as { claimContentDigest: string; lastReviewedCommit: string };
    expect(ledger.claimContentDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(ledger.lastReviewedCommit.length).toBeGreaterThan(0);

    const roadmap = readFileSync(path.join(repoRoot, "ROADMAP.md"), "utf8");
    const markers = [
      ...roadmap.matchAll(
        /^## Current — published `(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)`$/gm,
      ),
    ];
    expect(markers).toHaveLength(1);
    expect(markers[0]?.[1]).toBe(pkgVersion);

    const second = spawnSync(process.execPath, [syncScript, "--check"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(second.status, second.stderr || second.stdout).toBe(0);

    const check = spawnSync(process.execPath, [publicTruthCheck], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(check.status, check.stderr || check.stdout).toBe(0);
  });

  it("fails sync --check when ROADMAP Current published marker is stale", () => {
    const roadmapPath = path.join(repoRoot, "ROADMAP.md");
    const original = readFileSync(roadmapPath, "utf8");
    const pkgVersion = JSON.parse(
      readFileSync(path.join(repoRoot, "package.json"), "utf8"),
    ).version as string;
    const stale = original.replace(
      new RegExp(
        `## Current — published \`${pkgVersion.replace(/\./g, "\\.")}\``,
      ),
      "## Current — published `0.0.0`",
    );
    expect(stale).not.toBe(original);
    try {
      writeFileSync(roadmapPath, stale, "utf8");
      const check = spawnSync(process.execPath, [syncScript, "--check"], {
        cwd: repoRoot,
        encoding: "utf8",
      });
      expect(check.status).not.toBe(0);
      expect(`${check.stdout}\n${check.stderr}`).toMatch(/ROADMAP\.md/);
    } finally {
      writeFileSync(roadmapPath, original, "utf8");
    }
  });
});

describe("demo-verify fail-closed", () => {
  it("fails with AI_DEMO_VERIFY_CLI_MISSING when CLI dist is absent", () => {
    const cli = path.join(repoRoot, "packages/cli/dist/index.cjs");
    const backup = path.join(
      path.dirname(cli),
      `index.cjs.bak-demo-verify-test-${process.pid}-${Date.now()}`,
    );
    let moved = false;
    try {
      expect(existsSync(cli), `expected built CLI at ${cli}`).toBe(true);
      expect(existsSync(backup), `backup path must be free: ${backup}`).toBe(false);
      renameSync(cli, backup);
      moved = true;
      expect(existsSync(cli)).toBe(false);
      expect(existsSync(backup)).toBe(true);

      const result = spawnSync(process.execPath, [demoVerify], {
        cwd: repoRoot,
        encoding: "utf8",
      });
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain("AI_DEMO_VERIFY_CLI_MISSING");
    } finally {
      if (moved && existsSync(backup)) {
        if (existsSync(cli)) {
          unlinkSync(cli);
        }
        renameSync(backup, cli);
      }
    }
  });
});
