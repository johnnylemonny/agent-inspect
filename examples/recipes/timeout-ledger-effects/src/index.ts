/**
 * #492 — show what happened after a timeout (Navya / W10).
 * In-process fake ledger; handlers are actually called. Not exactly-once.
 */
import path from "node:path";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";

import { inspectRun, observeOutcome, step } from "agent-inspect";

const silent = process.env.AGENT_INSPECT_SILENT === "true";
const baseDir = path.join(process.cwd(), ".agent-inspect-runs");

type Fault = "none" | "timeout-after-commit" | "fail-before-commit";
type Claim = "effect_present" | "no_effect" | "failed";
type Class = "pass" | "fail" | "unknown" | "task-fail-safe";

interface Marker {
  markerId: string;
  operationId: string;
  attemptId: string;
  args: Record<string, string>;
}

interface Ledger {
  markers: Marker[];
  next: number;
}

function createLedger(): Ledger {
  return { markers: [], next: 1 };
}

/** Real in-process handler — always invoked by the cases that call it. */
async function commitMarker(
  ledger: Ledger,
  input: {
    operationId: string;
    attemptId: string;
    args: Record<string, string>;
    fault: Fault;
    dedupeKey?: string;
  },
): Promise<{ markerId: string }> {
  if (input.fault === "fail-before-commit") {
    const err = new Error("handler failed before commit");
    (err as Error & { code?: string }).code = "EFAIL";
    throw err;
  }

  if (input.dedupeKey) {
    const existing = ledger.markers.find(
      (m) =>
        m.operationId === input.operationId &&
        m.args.dedupeKey === input.dedupeKey,
    );
    if (existing) {
      if (input.fault === "timeout-after-commit") {
        const err = new Error("ETIMEDOUT after dedupe");
        (err as Error & { code?: string }).code = "ETIMEDOUT";
        throw err;
      }
      return { markerId: existing.markerId };
    }
  }

  const markerId = `m${ledger.next++}`;
  ledger.markers.push({
    markerId,
    operationId: input.operationId,
    attemptId: input.attemptId,
    args: { ...input.args },
  });

  if (input.fault === "timeout-after-commit") {
    const err = new Error("ETIMEDOUT after commit");
    (err as Error & { code?: string }).code = "ETIMEDOUT";
    throw err;
  }
  return { markerId };
}

function markersForOp(ledger: Ledger, operationId: string): Marker[] {
  return ledger.markers.filter((m) => m.operationId === operationId);
}

interface ObserverJoin {
  observedOperationId: string;
  observedMarkerIds: string[];
  /** Business-arg fingerprint from observer (must match committed markers). */
  observedArgsFingerprint?: string;
}

function argsFingerprint(args: Record<string, string>): string {
  return Object.keys(args)
    .sort()
    .map((k) => `${k}=${args[k]}`)
    .join("&");
}

/** Derive join validity from source markers vs observer records (not a boolean flag). */
function deriveJoinOk(input: {
  ledger: Ledger;
  operationId: string;
  observer: ObserverJoin;
}): boolean {
  if (input.observer.observedOperationId !== input.operationId) return false;
  const markers = markersForOp(input.ledger, input.operationId);
  const markerIds = new Set(markers.map((m) => m.markerId));
  for (const id of input.observer.observedMarkerIds) {
    if (!markerIds.has(id)) return false;
  }
  if (input.observer.observedArgsFingerprint !== undefined) {
    const fps = new Set(markers.map((m) => argsFingerprint(m.args)));
    if (
      fps.size > 1 ||
      (fps.size === 1 && !fps.has(input.observer.observedArgsFingerprint))
    ) {
      return false;
    }
  }
  return true;
}

function classify(input: {
  ledger: Ledger;
  operationId: string;
  attemptCount: number;
  claim: Claim;
  windowComplete: boolean;
  observed: boolean;
  observer: ObserverJoin;
}): Class {
  if (!input.observed || !input.windowComplete) return "unknown";
  // attemptCount is part of the classifier evidence surface (must be positive when observed).
  if (!Number.isFinite(input.attemptCount) || input.attemptCount < 1) {
    return "unknown";
  }
  const joinOk = deriveJoinOk({
    ledger: input.ledger,
    operationId: input.operationId,
    observer: input.observer,
  });
  if (!joinOk) return "fail";

  const markers = markersForOp(input.ledger, input.operationId);
  const distinct = new Set(markers.map((m) => m.markerId)).size;

  if (distinct > 1) return "fail"; // duplicate committed effect

  if (input.claim === "effect_present") {
    return distinct === 1 ? "pass" : "fail";
  }
  if (input.claim === "no_effect") {
    // Contradicts a present marker.
    return distinct === 0 ? "pass" : "fail";
  }
  // Honest failure claim: task failed; duplicate-safety holds when ≤1 marker.
  if (distinct <= 1) return "task-fail-safe";
  return "fail";
}

type CaseResult = { id: string; expected: Class; observed: Class };
const results: CaseResult[] = [];
const evidenceRows: Array<{
  id: string;
  operationId: string;
  attemptCount: number;
  distinctMarkers: number;
  markerIds: string[];
  observer: ObserverJoin;
  claim: Claim;
  class: Class;
}> = [];

async function runCase(
  id: string,
  expected: Class,
  fn: () => Promise<{
    ledger: Ledger;
    operationId: string;
    attemptCount: number;
    claim: Claim;
    windowComplete: boolean;
    observed: boolean;
    observer: ObserverJoin;
  }>,
) {
  const traceDir = path.join(baseDir, id);
  rmSync(traceDir, { recursive: true, force: true });
  mkdirSync(traceDir, { recursive: true });

  let verdictInputs: Awaited<ReturnType<typeof fn>> | undefined;
  await inspectRun(
    id,
    async () => {
      verdictInputs = await fn();
    },
    { silent, traceDir },
  );

  if (!verdictInputs) throw new Error(`case ${id} produced no verdict inputs`);
  const observed = classify(verdictInputs);
  results.push({ id, expected, observed });
  const markers = markersForOp(verdictInputs.ledger, verdictInputs.operationId);
  const distinctMarkers = new Set(markers.map((m) => m.markerId)).size;
  // Derive attempt/marker counts from retained records — not only attemptCount > 0.
  if (
    verdictInputs.windowComplete &&
    verdictInputs.observed &&
    (verdictInputs.attemptCount < 1 ||
      (verdictInputs.observer.observedMarkerIds.length > 0 &&
        distinctMarkers !==
          new Set(verdictInputs.observer.observedMarkerIds).size))
  ) {
    throw new Error(
      `${id}: retained attempt/marker evidence irreconcilable (attempts=${verdictInputs.attemptCount} distinctMarkers=${distinctMarkers})`,
    );
  }
  evidenceRows.push({
    id,
    operationId: verdictInputs.operationId,
    attemptCount: verdictInputs.attemptCount,
    distinctMarkers,
    markerIds: markers.map((m) => m.markerId),
    observer: verdictInputs.observer,
    claim: verdictInputs.claim,
    class: observed,
  });
  writeFileSync(
    path.join(traceDir, "case-evidence.json"),
    JSON.stringify(evidenceRows[evidenceRows.length - 1], null, 2) + "\n",
  );
  void readdirSync(traceDir).filter((f) => f.endsWith(".jsonl"));
  console.log(
    `  ${id}: expected=${expected} observed=${observed} attempts=${verdictInputs.attemptCount} markers=${distinctMarkers}`,
  );
}

console.log("timeout-ledger-effects:");

await runCase("T01-dedupe-ok", "pass", async () => {
  const ledger = createLedger();
  const operationId = "op1";
  const args = { amount: "10", dedupeKey: "k1" };
  let attempts = 0;

  try {
    attempts += 1;
    await step(
      "ledger_commit",
      async () =>
        commitMarker(ledger, {
          operationId,
          attemptId: "a1",
          args,
          fault: "timeout-after-commit",
          dedupeKey: "k1",
        }),
      {
        type: "tool",
        metadata: {
          toolName: "ledger_commit",
          operationId,
          attemptId: "a1",
          attemptNumber: 1,
        },
      },
    );
  } catch {
    /* injected timeout after commit */
  }

  try {
    attempts += 1;
    await step(
      "ledger_commit",
      async () =>
        commitMarker(ledger, {
          operationId,
          attemptId: "a2",
          args,
          fault: "none",
          dedupeKey: "k1",
        }),
      {
        type: "tool",
        metadata: {
          toolName: "ledger_commit",
          operationId,
          attemptId: "a2",
          attemptNumber: 2,
          retryOf: "a1",
        },
      },
    );
  } catch {
    /* should not throw */
  }

  await step("report", async () => ({ claim: "effect_present" }));
  await observeOutcome("ledger-window", {
    expectation: "Observation window closed after handlers finished",
    status: "passed",
    method: "database",
    evidence: {
      operationId,
      markerCount: markersForOp(ledger, operationId).length,
      markerIds: markersForOp(ledger, operationId).map((m) => m.markerId),
    },
  });

  const markers = markersForOp(ledger, operationId);
  return {
    ledger,
    operationId,
    attemptCount: attempts,
    claim: "effect_present",
    windowComplete: true,
    observed: true,
    observer: {
      observedOperationId: operationId,
      observedMarkerIds: markers.map((m) => m.markerId),
      observedArgsFingerprint: argsFingerprint(args),
    },
  };
});

await runCase("T02-duplicate-markers", "fail", async () => {
  const ledger = createLedger();
  const operationId = "op1";
  let attempts = 0;

  try {
    attempts += 1;
    await step(
      "ledger_commit",
      async () =>
        commitMarker(ledger, {
          operationId,
          attemptId: "a1",
          args: { amount: "10" },
          fault: "timeout-after-commit",
        }),
      {
        type: "tool",
        metadata: {
          toolName: "ledger_commit",
          operationId,
          attemptId: "a1",
          attemptNumber: 1,
        },
      },
    );
  } catch {
    /* timeout */
  }

  try {
    attempts += 1;
    await step(
      "ledger_commit",
      async () =>
        commitMarker(ledger, {
          operationId,
          attemptId: "a2",
          args: { amount: "10" },
          fault: "none",
        }),
      {
        type: "tool",
        metadata: {
          toolName: "ledger_commit",
          operationId,
          attemptId: "a2",
          attemptNumber: 2,
          retryOf: "a1",
        },
      },
    );
  } catch {
    /* */
  }

  await observeOutcome("ledger-window", {
    expectation: "Window closed; two distinct markers for one intended op",
    status: "passed",
    method: "database",
    evidence: {
      operationId,
      markerIds: markersForOp(ledger, operationId).map((m) => m.markerId),
    },
  });

  const markers = markersForOp(ledger, operationId);
  return {
    ledger,
    operationId,
    attemptCount: attempts,
    claim: "effect_present",
    windowComplete: true,
    observed: true,
    observer: {
      observedOperationId: operationId,
      observedMarkerIds: markers.map((m) => m.markerId),
    },
  };
});

await runCase("T03-incomplete-window", "unknown", async () => {
  const ledger = createLedger();
  const operationId = "op1";
  let attempts = 0;
  try {
    attempts += 1;
    await step(
      "ledger_commit",
      async () =>
        commitMarker(ledger, {
          operationId,
          attemptId: "a1",
          args: { amount: "10", dedupeKey: "k1" },
          fault: "timeout-after-commit",
          dedupeKey: "k1",
        }),
      {
        type: "tool",
        metadata: {
          toolName: "ledger_commit",
          operationId,
          attemptId: "a1",
          attemptNumber: 1,
        },
      },
    );
  } catch {
    /* */
  }
  // No observeOutcome — incomplete observation window.
  return {
    ledger,
    operationId,
    attemptCount: attempts,
    claim: "effect_present",
    windowComplete: false,
    observed: false,
    observer: {
      observedOperationId: operationId,
      observedMarkerIds: markersForOp(ledger, operationId).map((m) => m.markerId),
    },
  };
});

await runCase("T04-contradictory-claim", "fail", async () => {
  const ledger = createLedger();
  const operationId = "op1";
  let attempts = 0;
  try {
    attempts += 1;
    await step(
      "ledger_commit",
      async () =>
        commitMarker(ledger, {
          operationId,
          attemptId: "a1",
          args: { amount: "10", dedupeKey: "k1" },
          fault: "none",
          dedupeKey: "k1",
        }),
      {
        type: "tool",
        metadata: {
          toolName: "ledger_commit",
          operationId,
          attemptId: "a1",
          attemptNumber: 1,
        },
      },
    );
  } catch {
    /* */
  }
  await step("report", async () => ({ claim: "no_effect" }));
  await observeOutcome("ledger-window", {
    expectation: "Window closed",
    status: "passed",
    method: "database",
    evidence: {
      operationId,
      markerIds: markersForOp(ledger, operationId).map((m) => m.markerId),
    },
  });
  const markers = markersForOp(ledger, operationId);
  return {
    ledger,
    operationId,
    attemptCount: attempts,
    claim: "no_effect",
    windowComplete: true,
    observed: true,
    observer: {
      observedOperationId: operationId,
      observedMarkerIds: markers.map((m) => m.markerId),
      observedArgsFingerprint: argsFingerprint({ amount: "10", dedupeKey: "k1" }),
    },
  };
});

await runCase("T05-wrong-join", "fail", async () => {
  const ledger = createLedger();
  const operationId = "op1";
  let attempts = 0;
  try {
    attempts += 1;
    await step(
      "ledger_commit",
      async () =>
        commitMarker(ledger, {
          operationId,
          attemptId: "a1",
          args: { amount: "10", dedupeKey: "k1" },
          fault: "timeout-after-commit",
          dedupeKey: "k1",
        }),
      {
        type: "tool",
        metadata: {
          toolName: "ledger_commit",
          operationId,
          attemptId: "a1",
          attemptNumber: 1,
        },
      },
    );
  } catch {
    /* */
  }
  try {
    attempts += 1;
    // Changed business arguments on retry — must not merge by key alone.
    await step(
      "ledger_commit",
      async () =>
        commitMarker(ledger, {
          operationId,
          attemptId: "a2",
          args: { amount: "99", dedupeKey: "k1" },
          fault: "none",
          dedupeKey: "k1",
        }),
      {
        type: "tool",
        metadata: {
          toolName: "ledger_commit",
          operationId,
          attemptId: "a2",
          attemptNumber: 2,
          retryOf: "a1",
        },
      },
    );
  } catch {
    /* */
  }
  await observeOutcome("ledger-window", {
    expectation: "Window closed; observer joined wrong operation identity",
    status: "passed",
    method: "database",
    evidence: { operationId: "op-OTHER", markerIds: ["m1"] },
  });
  // Join derived from observer records (wrong operationId / args), not a preset flag.
  return {
    ledger,
    operationId,
    attemptCount: attempts,
    claim: "effect_present",
    windowComplete: true,
    observed: true,
    observer: {
      observedOperationId: "op-OTHER",
      observedMarkerIds: ["m1"],
      observedArgsFingerprint: argsFingerprint({ amount: "10", dedupeKey: "k1" }),
    },
  };
});

await runCase("T06-honest-no-effect", "task-fail-safe", async () => {
  const ledger = createLedger();
  const operationId = "op1";
  let attempts = 0;
  try {
    attempts += 1;
    await step(
      "ledger_commit",
      async () =>
        commitMarker(ledger, {
          operationId,
          attemptId: "a1",
          args: { amount: "10" },
          fault: "fail-before-commit",
        }),
      {
        type: "tool",
        metadata: {
          toolName: "ledger_commit",
          operationId,
          attemptId: "a1",
          attemptNumber: 1,
        },
      },
    );
  } catch {
    /* fail before commit */
  }
  await step("report", async () => ({ claim: "failed" }));
  await observeOutcome("ledger-window", {
    expectation: "Window closed; honest task failure, zero markers",
    status: "passed",
    method: "database",
    evidence: {
      operationId,
      markerCount: 0,
      markerIds: [],
    },
  });
  return {
    ledger,
    operationId,
    attemptCount: attempts,
    claim: "failed",
    windowComplete: true,
    observed: true,
    observer: {
      observedOperationId: operationId,
      observedMarkerIds: [],
    },
  };
});

console.log(
  `classes: ${results.map((r) => `${r.id.slice(0, 3)}:${r.observed}`).join(",")}`,
);

const evidencePath = path.join(baseDir, "timeout-ledger-evidence-table.json");
writeFileSync(evidencePath, JSON.stringify(evidenceRows, null, 2) + "\n");
console.log(`evidence-table: ${evidencePath}`);

const t01 = evidenceRows.find((r) => r.id === "T01-dedupe-ok");
const t02 = evidenceRows.find((r) => r.id === "T02-duplicate-markers");
if (!t01 || t01.attemptCount !== 2 || t01.distinctMarkers !== 1) {
  console.error("T01 must retain 2 attempts and 1 distinct committed marker", t01);
  process.exitCode = 1;
}
if (!t02 || t02.attemptCount !== 2 || t02.distinctMarkers !== 2) {
  console.error("T02 must retain 2 attempts and 2 distinct markers", t02);
  process.exitCode = 1;
}

const mismatch = results.filter((r) => r.expected !== r.observed);
if (mismatch.length) {
  console.error("classification mismatches", mismatch);
  process.exitCode = 1;
}
