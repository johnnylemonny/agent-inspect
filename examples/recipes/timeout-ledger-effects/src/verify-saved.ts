/**
 * Read-only verdicts from reopened JSONL. No ledger, expected labels, or handlers.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export type Class = "pass" | "fail" | "unknown" | "task-fail-safe";

export interface SavedVerdict {
  class: Class;
  observation: "passed" | "absent" | "unknown";
  effect: "pass" | "fail" | "unknown";
  claim: "pass" | "fail" | "unknown";
  join: "valid" | "invalid" | "unknown";
  args: "match" | "mismatch" | "unknown";
  faultProvenance: "injected" | "none" | "unknown";
  keyScope: "ok" | "violation" | "undeclared";
  attemptCount: number;
  distinctMarkers: number;
  operations: string[];
}

interface Row {
  event?: string;
  name?: string;
  status?: string;
  stepId?: string;
  error?: { message?: string };
  evidence?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

interface Attempt {
  operationId: string;
  attemptId: string;
  argsFingerprint?: string;
  faultPlan?: string;
  injectionApplied: boolean;
  markerId?: string;
  dedupeKey?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function readRows(traceDir: string): Row[] {
  let names: string[] = [];
  try {
    names = readdirSync(traceDir).filter((file) => file.endsWith(".jsonl"));
  } catch {
    return [];
  }
  const rows: Row[] = [];
  for (const name of names.sort()) {
    const raw = readFileSync(path.join(traceDir, name), "utf8");
    for (const line of raw.split("\n")) {
      if (line.trim() === "") continue;
      try {
        const parsed = JSON.parse(line) as unknown;
        if (isRecord(parsed)) rows.push(parsed as Row);
      } catch {
        return [];
      }
    }
  }
  return rows;
}

function attemptsFrom(rows: Row[]): Attempt[] {
  const attempts: Attempt[] = [];
  for (const row of rows) {
    if (row.event !== "outcome_observed" || row.name !== "ledger-attempt") continue;
    const evidence = row.evidence;
    if (!isRecord(evidence)) continue;
    const operationId = text(evidence.operationId);
    const attemptId = text(evidence.attemptId);
    if (!operationId || !attemptId) continue;
    attempts.push({
      operationId,
      attemptId,
      argsFingerprint: text(evidence.argsFingerprint),
      faultPlan: text(evidence.faultPlan),
      injectionApplied: evidence.injectionApplied === true,
      markerId: text(evidence.markerId),
      dedupeKey: text(evidence.dedupeKey),
    });
  }
  return attempts;
}

/** Canonical fingerprint: sorted JSON pairs, not a key=value concatenation. */
export function argsFingerprint(args: Record<string, string>): string {
  const keys = Object.keys(args).sort();
  return JSON.stringify(keys.map((key) => [key, args[key]]));
}

export function verifySaved(traceDir: string): SavedVerdict {
  const rows = readRows(traceDir);
  const attempts = attemptsFrom(rows);
  const operations = [...new Set(attempts.map((attempt) => attempt.operationId))];
  const windows = rows.filter(
    (row) => row.event === "outcome_observed" && row.name === "ledger-window",
  );
  const claims = rows.filter(
    (row) => row.event === "outcome_observed" && row.name === "report-claim",
  );
  const policy = rows.find(
    (row) => row.event === "outcome_observed" && row.name === "key-scope-policy",
  );

  const distinctMarkers = new Set(
    attempts.map((attempt) => attempt.markerId).filter((id): id is string => id !== undefined),
  ).size;

  let observation: SavedVerdict["observation"] = windows.length === 0 ? "absent" : "passed";
  if (windows.some((row) => row.status === "unknown" || row.evidence?.window === "incomplete")) {
    observation = "unknown";
  }

  let join: SavedVerdict["join"] = windows.length === 0 ? "unknown" : "valid";
  for (const window of windows) {
    const evidence = window.evidence;
    const observedOperationId = text(evidence?.operationId);
    if (!observedOperationId || !operations.includes(observedOperationId)) {
      join = "invalid";
      continue;
    }
    const observedIds = Array.isArray(evidence?.markerIds)
      ? evidence.markerIds.filter((id): id is string => typeof id === "string")
      : [];
    const known = new Set(
      attempts
        .filter((attempt) => attempt.operationId === observedOperationId)
        .map((attempt) => attempt.markerId)
        .filter((id): id is string => id !== undefined),
    );
    if (observedIds.some((id) => !known.has(id))) join = "invalid";
  }

  const fingerprintsByOp = new Map<string, Set<string>>();
  let args: SavedVerdict["args"] = attempts.length === 0 ? "unknown" : "match";
  for (const attempt of attempts) {
    const set = fingerprintsByOp.get(attempt.operationId) ?? new Set<string>();
    if (!attempt.argsFingerprint) args = "unknown";
    else set.add(attempt.argsFingerprint);
    fingerprintsByOp.set(attempt.operationId, set);
  }
  for (const set of fingerprintsByOp.values()) {
    if (set.size > 1) args = "mismatch";
  }

  let effect: SavedVerdict["effect"] = attempts.length === 0 ? "unknown" : "pass";
  for (const operationId of operations) {
    const ids = new Set(
      attempts
        .filter((attempt) => attempt.operationId === operationId && attempt.markerId)
        .map((attempt) => attempt.markerId),
    );
    if (ids.size > 1) effect = "fail";
  }
  if (args === "mismatch") effect = "fail";

  let claim: SavedVerdict["claim"] = claims.length === 0 ? "unknown" : "pass";
  let failedClaim = false;
  if (claims.length > 0) {
    for (const row of claims) {
      const evidence = row.evidence;
      const operationId = text(evidence?.operationId);
      const label = text(evidence?.claim);
      const ids = new Set(
        attempts
          .filter((attempt) => attempt.operationId === operationId && attempt.markerId)
          .map((attempt) => attempt.markerId),
      );
      if (label === "failed") {
        failedClaim = true;
        if (ids.size > 1) claim = "fail";
      } else if (label === "no_effect") {
        if (ids.size !== 0) claim = "fail";
      } else if (label === "effect_present") {
        if (ids.size !== 1 || args === "mismatch") claim = "fail";
      } else {
        claim = "unknown";
      }
    }
  }

  const applied = attempts.some((attempt) => attempt.injectionApplied);
  const planned = attempts.some(
    (attempt) => attempt.faultPlan === "timeout-after-commit" || attempt.faultPlan === "fail-before-commit",
  );
  const errorText = rows.some(
    (row) => row.event === "step_completed" && /ETIMEDOUT/.test(row.error?.message ?? ""),
  );
  let faultProvenance: SavedVerdict["faultProvenance"] = "none";
  if (applied) faultProvenance = "injected";
  else if (errorText || (planned && !applied)) faultProvenance = "unknown";

  let keyScope: SavedVerdict["keyScope"] = "undeclared";
  const declared = policy?.evidence?.policy === "no-reuse";
  if (declared) {
    keyScope = "ok";
    const seen = new Map<string, Set<string>>();
    for (const attempt of attempts) {
      if (!attempt.dedupeKey) continue;
      const ops = seen.get(attempt.dedupeKey) ?? new Set<string>();
      ops.add(attempt.operationId);
      seen.set(attempt.dedupeKey, ops);
    }
    for (const ops of seen.values()) {
      if (ops.size > 1) keyScope = "violation";
    }
  }

  let verdict: Class = "pass";
  if (
    effect === "fail" ||
    claim === "fail" ||
    join === "invalid" ||
    args === "mismatch" ||
    keyScope === "violation"
  ) {
    verdict = "fail";
  } else if (failedClaim && effect === "pass" && args === "match" && observation === "passed") {
    verdict = "task-fail-safe";
  } else if (
    observation !== "passed" ||
    join !== "valid" ||
    claim !== "pass" ||
    args !== "match" ||
    effect !== "pass"
  ) {
    verdict = "unknown";
  }

  return {
    class: verdict,
    observation,
    effect,
    claim,
    join,
    args,
    faultProvenance,
    keyScope,
    attemptCount: attempts.length,
    distinctMarkers,
    operations,
  };
}
