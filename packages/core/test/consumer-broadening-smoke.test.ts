/**
 * C13 bounded consumer smoke — not a Nest campaign.
 * Pins one adapter-shaped path: shared packed CJS context identity already
 * covered elsewhere; here we verify Evidence verify + TraceContract on a
 * fixture after a manual inspector write (restart-safe local disk reread).
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  EVIDENCE_MANIFEST_FILENAME,
  buildEvidenceManifest,
  serializeEvidenceManifest,
  sha256Hex,
  verifyEvidenceDirectory,
} from "../src/evidence/index.js";
import { createInspector } from "../src/inspector.js";
import { defineTraceContract, evaluateTraceContract } from "../src/checks/contract.js";
import { openTrace } from "../src/readers/index.js";
import { fileWriter } from "../src/writers/index.js";

describe("C13 bounded consumer smoke", () => {
  it("survives disk reread + evidence verify for a manual Nest-shaped capture", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "c13-consumer-smoke-"));
    const traceDir = path.join(dir, ".agent-inspect");
    const evidenceDir = path.join(dir, "evidence");
    await mkdir(traceDir, { recursive: true });
    await mkdir(evidenceDir, { recursive: true });

    try {
      const runId = "c13-nest-shaped-run";
      const writer = fileWriter({ dir: traceDir });
      const inspector = createInspector({ writer, silent: true });
      await inspector.run(
        "nest-support-agent",
        async () => {
          await inspector.tool("lookupFixture", async () => ({ ok: true }));
          return { answer: "fixture" };
        },
        { runId, traceDir },
      );
      await writer.flush?.();
      await writer.close?.();

      // Simulate process restart: reopen from disk only.
      const read = await openTrace({ type: "file", path: path.join(traceDir, `${runId}.jsonl`) });
      expect(read.runs[0]?.runId).toBe(runId);

      const contract = defineTraceContract({
        tools: { required: ["lookupFixture"] },
      });
      const check = evaluateTraceContract({ read }, contract);
      expect(check.status).toBe("pass");

      const traceBytes = await readFile(path.join(traceDir, `${runId}.jsonl`), "utf8");
      const checkJson = `${JSON.stringify(check, null, 2)}\n`;
      await writeFile(path.join(evidenceDir, "trace.jsonl"), traceBytes);
      await writeFile(path.join(evidenceDir, "check-results.json"), checkJson);

      const files = [
        { path: "trace.jsonl", content: traceBytes, role: "redacted-trace" as const },
        { path: "check-results.json", content: checkJson, role: "checks" as const },
      ];
      const manifest = buildEvidenceManifest({
        generatorVersion: "test",
        runIds: [runId],
        traceSchemaVersions: ["1.0"],
        sourceHashes: [{ runId, algorithm: "sha256", hash: sha256Hex(traceBytes) }],
        redactionProfile: "share",
        assessmentStatus: "SAFE WITH WARNINGS",
        files,
        createdAt: "2026-09-27T00:00:00.000Z",
        inputs: {
          scenarioId: "c13-bounded-smoke",
          profileId: "nest-shaped-manual",
          note: "Bounded smoke only — not a reliability campaign.",
        },
      });
      await writeFile(
        path.join(evidenceDir, EVIDENCE_MANIFEST_FILENAME),
        serializeEvidenceManifest(manifest),
      );

      const verified = await verifyEvidenceDirectory(evidenceDir);
      expect(verified.ok).toBe(true);

      // Tamper must fail.
      await writeFile(path.join(evidenceDir, "trace.jsonl"), `${traceBytes}\n`);
      const tampered = await verifyEvidenceDirectory(evidenceDir);
      expect(tampered.ok).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
