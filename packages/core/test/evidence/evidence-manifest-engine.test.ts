import { describe, expect, it } from "vitest";

import {
  EVIDENCE_FORMAT_VERSION,
  EVIDENCE_MANIFEST_FILENAME,
  assertEvidenceRelativePath,
  buildEvidenceFileEntries,
  buildEvidenceManifest,
  collectTraceSchemaVersions,
  inferEvidenceFileRole,
  parseEvidenceManifestJson,
  serializeEvidenceManifest,
  sha256Equals,
  sha256Hex,
  validateEvidenceManifest,
} from "../../src/evidence/index.js";

describe("evidence hash engine (6.10-1)", () => {
  it("hashes UTF-8 strings and bytes identically for the same content", () => {
    const text = "hello evidence\n";
    const fromString = sha256Hex(text);
    const fromBytes = sha256Hex(Buffer.from(text, "utf8"));
    expect(fromString).toBe(fromBytes);
    expect(fromString).toMatch(/^[a-f0-9]{64}$/);
    expect(sha256Equals(fromString, fromBytes)).toBe(true);
    expect(sha256Equals(fromString, "0".repeat(64))).toBe(false);
  });

  it("rejects unsafe relative paths", () => {
    expect(() => assertEvidenceRelativePath("../x")).toThrow(/must not contain/);
    expect(() => assertEvidenceRelativePath("/abs")).toThrow(/must be relative/);
    expect(assertEvidenceRelativePath("assets/runs/a.html")).toBe("assets/runs/a.html");
  });

  it("builds sorted file entries and refuses self-hash of evidence.json", () => {
    const entries = buildEvidenceFileEntries([
      { path: "trace.jsonl", content: "a\n" },
      { path: "summary.md", content: "# hi\n" },
    ]);
    expect(entries.map((e) => e.path)).toEqual(["summary.md", "trace.jsonl"]);
    expect(entries[0]!.role).toBe("summary");
    expect(entries[1]!.role).toBe("redacted-trace");
    expect(entries[1]!.sha256).toBe(sha256Hex("a\n"));

    expect(() =>
      buildEvidenceFileEntries([{ path: EVIDENCE_MANIFEST_FILENAME, content: "{}\n" }]),
    ).toThrow(/self-hash/);
  });

  it("builds a serializable Evidence v1.0 manifest", () => {
    const content = '{"schemaVersion":"0.2"}\n';
    const packaged = [
      { path: "trace.jsonl", content },
      { path: "trace.html", content: "<html></html>\n" },
      { path: "check-results.json", content: "{}\n" },
    ];
    const manifest = buildEvidenceManifest({
      generatorVersion: "6.10.0",
      runIds: ["run_a"],
      traceSchemaVersions: collectTraceSchemaVersions(content),
      sourceHashes: [
        { runId: "run_a", algorithm: "sha256", hash: sha256Hex("raw-source\n") },
      ],
      redactionProfile: "share",
      assessmentStatus: "SAFE",
      sourceStatus: "UNSAFE",
      files: packaged,
      createdAt: "2026-08-02T00:00:00.000Z",
    });

    expect(manifest.evidenceFormatVersion).toBe(EVIDENCE_FORMAT_VERSION);
    expect(manifest.source.traceSchemaVersions).toEqual(["0.2"]);
    expect(manifest.assessment.sourceStatus).toBe("UNSAFE");
    expect(inferEvidenceFileRole("check-results.json")).toBe("checks");

    const text = serializeEvidenceManifest(manifest);
    const roundTrip = parseEvidenceManifestJson(text);
    expect(roundTrip.files).toEqual(manifest.files);
    expect(validateEvidenceManifest(JSON.parse(text))).toMatchObject({
      evidenceFormatVersion: "1.0",
      generator: { name: "agent-inspect", version: "6.10.0" },
    });
  });

  it("preserves additive input provenance bindings for older-reader compatibility", () => {
    const content = '{"schemaVersion":"1.0"}\n';
    const manifest = buildEvidenceManifest({
      generatorVersion: "6.31.11",
      runIds: ["run_inputs"],
      traceSchemaVersions: ["1.0"],
      sourceHashes: [
        { runId: "run_inputs", algorithm: "sha256", hash: sha256Hex(content) },
      ],
      redactionProfile: "share",
      assessmentStatus: "SAFE WITH WARNINGS",
      files: [{ path: "trace.jsonl", content }],
      createdAt: "2026-09-27T00:00:00.000Z",
      inputs: {
        scenarioId: "before-departure",
        profileId: "live-profile-a",
        lockfileSha256: "a".repeat(64),
        appSnapshotSha256: "b".repeat(64),
        dirtyPatchSha256: "c".repeat(64),
        note: "Hashes bind integrity relative to this manifest only.",
      },
    });
    expect(manifest.inputs?.scenarioId).toBe("before-departure");
    const roundTrip = parseEvidenceManifestJson(serializeEvidenceManifest(manifest));
    expect(roundTrip.inputs).toEqual(manifest.inputs);
  });

  it("detects hash mismatch when packaged bytes change", () => {
    const original = "trace-body\n";
    const entry = buildEvidenceFileEntries([{ path: "trace.jsonl", content: original }])[0]!;
    expect(sha256Equals(entry.sha256, sha256Hex(original))).toBe(true);
    expect(sha256Equals(entry.sha256, sha256Hex("tampered\n"))).toBe(false);
  });
});
