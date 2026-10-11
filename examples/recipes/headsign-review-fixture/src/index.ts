/**
 * meganemura/headsign review fixture (W13).
 * Synthetic transcripts only — never execute recorded shell commands.
 *
 * Historical pin (docs-era CLI contract; not a current headsign integration):
 *   meganemura/headsign@v0.3.0
 *   commit e375f96d1332c59bfa824bdc0bad039d336ba605
 *   https://github.com/meganemura/headsign/blob/e375f96d1332c59bfa824bdc0bad039d336ba605/README.md#the-contract
 *
 * Documented `next` first-line / exit contract (historical):
 *   ADVANCE <phase> → exit 0  (continue; possibly fail-routed — NOT terminus)
 *   COMPLETE        → exit 0  (terminus)
 *   RETRY|PENDING   → exit 1
 *   ESCALATE|ABORT  → exit 2
 *   config/usage    → exit 3
 *
 * `status` is a separate surface: exit 0 when state readable (incl. ESCALATED/ABORTED);
 * exit 3 when unreadable. status never prints ADVANCE/RETRY/PENDING.
 */
type Class = "pass" | "fail";

type NextToken = "advance" | "complete" | "retry" | "escalate" | "missing";
/** Declared reviewer claim about where the run is. */
type PhaseClaim = "terminal" | "continue" | "retry" | "escalate" | "none";

interface SyntheticNext {
  /** Labeled synthetic — not from a live CLI run. */
  synthetic: true;
  firstLine: string;
  exitCode: number;
  proseTail?: string;
}

interface SyntheticStatus {
  synthetic: true;
  firstLine: string;
  exitCode: number;
}

interface ReviewRecord {
  requestedValidation: boolean;
  validationObservation?: SyntheticNext;
  /** Explicit claim: terminal completion vs continue-at-phase. */
  phaseClaim: PhaseClaim;
  retryOrEscalation?: "none" | "retry" | "escalate";
}

const HISTORICAL_PIN =
  "meganemura/headsign@v0.3.0 / e375f96d1332c59bfa824bdc0bad039d336ba605";

/** Parse next first-line token (ignore prose). ADVANCE ≠ COMPLETE. */
function nextTokenFrom(obs: SyntheticNext): NextToken {
  const token = obs.firstLine.trim().split(/\s+/)[0] ?? "";
  if (token === "COMPLETE") {
    return obs.exitCode === 0 ? "complete" : "missing";
  }
  if (token === "ADVANCE") {
    return obs.exitCode === 0 ? "advance" : "missing";
  }
  if (token === "RETRY" || token === "PENDING") {
    return obs.exitCode === 1 ? "retry" : "missing";
  }
  if (token === "ESCALATE" || token === "ABORT") {
    return obs.exitCode === 2 ? "escalate" : "missing";
  }
  return "missing";
}

/**
 * status surface contract (independent of next tokens):
 * - known state tokens + exit 0 → readable ok
 * - exit 3 → unreadable (acceptable for empty/unknown first line)
 * - known token with wrong exit → contract break
 */
function statusContractHolds(obs: SyntheticStatus): boolean {
  const token = obs.firstLine.trim().split(/\s+/)[0] ?? "";
  const readable = ["RUNNING", "COMPLETE", "ESCALATED", "ABORTED"];
  if (readable.includes(token)) {
    return obs.exitCode === 0;
  }
  return obs.exitCode === 3;
}

function classify(record: ReviewRecord): Class {
  if (!record.requestedValidation) return "fail";
  if (!record.validationObservation) return "fail";
  const token = nextTokenFrom(record.validationObservation);
  if (token === "missing") return "fail";

  const retryOrEscalation = record.retryOrEscalation ?? "none";

  if (token === "complete") {
    return record.phaseClaim === "terminal" && retryOrEscalation === "none"
      ? "pass"
      : "fail";
  }
  if (token === "advance") {
    // Continue / next-phase: terminal claim is unjustified completion.
    return record.phaseClaim === "continue" && retryOrEscalation === "none"
      ? "pass"
      : "fail";
  }
  if (token === "retry") {
    return retryOrEscalation === "retry" &&
      record.phaseClaim !== "terminal" &&
      (record.phaseClaim === "retry" || record.phaseClaim === "none")
      ? "pass"
      : "fail";
  }
  if (token === "escalate") {
    return retryOrEscalation === "escalate" &&
      record.phaseClaim !== "terminal" &&
      (record.phaseClaim === "escalate" || record.phaseClaim === "none")
      ? "pass"
      : "fail";
  }
  return "fail";
}

type CaseResult = { id: string; expected: Class; observed: Class };
const results: CaseResult[] = [];

function check(id: string, expected: Class, record: ReviewRecord) {
  const observed = classify(record);
  results.push({ id, expected, observed });
  console.log(`  ${id}: expected=${expected} observed=${observed}`);
}

function checkStatus(id: string, expected: Class, obs: SyntheticStatus) {
  const holds = statusContractHolds(obs);
  const observed: Class = holds ? "pass" : "fail";
  results.push({ id, expected, observed });
  console.log(`  ${id}: expected=${expected} observed=${observed}`);
}

console.log("headsign-review-fixture:");
console.log(
  `  pin: ${HISTORICAL_PIN} (historical/docs-only/synthetic; not current CLI)`,
);

check("H01-success-final", "pass", {
  requestedValidation: true,
  validationObservation: {
    synthetic: true,
    firstLine: "COMPLETE",
    exitCode: 0,
    proseTail: "--- phase: done --- ship it",
  },
  phaseClaim: "terminal",
  retryOrEscalation: "none",
});

check("H01b-advance-continue", "pass", {
  requestedValidation: true,
  validationObservation: {
    synthetic: true,
    firstLine: "ADVANCE review",
    exitCode: 0,
    proseTail: "--- phase: continue ---",
  },
  phaseClaim: "continue",
  retryOrEscalation: "none",
});

check("H01c-advance-terminal-claim", "fail", {
  requestedValidation: true,
  validationObservation: {
    synthetic: true,
    firstLine: "ADVANCE review",
    exitCode: 0,
  },
  phaseClaim: "terminal",
  retryOrEscalation: "none",
});

check("H02-fail-retry", "pass", {
  requestedValidation: true,
  validationObservation: {
    synthetic: true,
    firstLine: "RETRY 1/3 lint",
    exitCode: 1,
    proseTail: "lint failed; try again",
  },
  phaseClaim: "retry",
  retryOrEscalation: "retry",
});

check("H03-fail-escalate", "pass", {
  requestedValidation: true,
  validationObservation: {
    synthetic: true,
    firstLine: "ESCALATE needs-human",
    exitCode: 2,
  },
  phaseClaim: "escalate",
  retryOrEscalation: "escalate",
});

check("H04-requested-not-run", "fail", {
  requestedValidation: true,
  phaseClaim: "none",
  retryOrEscalation: "none",
});

check("H05-unjustified-final", "fail", {
  requestedValidation: true,
  validationObservation: {
    synthetic: true,
    firstLine: "RETRY 2/3 tests",
    exitCode: 1,
  },
  phaseClaim: "terminal",
  retryOrEscalation: "retry",
});

check("H06-missing-result", "fail", {
  requestedValidation: true,
  validationObservation: {
    synthetic: true,
    firstLine: "",
    exitCode: 3,
  },
  phaseClaim: "none",
  retryOrEscalation: "none",
});

check("H07-irrelevant-prose", "pass", {
  requestedValidation: true,
  validationObservation: {
    synthetic: true,
    firstLine: "COMPLETE",
    exitCode: 0,
    proseTail: "--- phase: done --- totally different incidental prose",
  },
  phaseClaim: "terminal",
  retryOrEscalation: "none",
});

check("H08-exit-change", "fail", {
  requestedValidation: true,
  validationObservation: {
    synthetic: true,
    firstLine: "COMPLETE",
    exitCode: 1,
  },
  phaseClaim: "terminal",
  retryOrEscalation: "none",
});

checkStatus("H09-status-readable-running", "pass", {
  synthetic: true,
  firstLine: "RUNNING",
  exitCode: 0,
});
checkStatus("H09b-status-readable-escalated", "pass", {
  synthetic: true,
  firstLine: "ESCALATED",
  exitCode: 0,
});
checkStatus("H10-status-wrong-exit", "fail", {
  synthetic: true,
  firstLine: "RUNNING",
  exitCode: 3,
});
checkStatus("H10b-status-unreadable", "pass", {
  synthetic: true,
  firstLine: "",
  exitCode: 3,
});

console.log(
  `classes: ${results.map((r) => `${r.id.slice(0, 3)}:${r.observed}`).join(",")}`,
);

const mismatch = results.filter((r) => r.expected !== r.observed);
if (mismatch.length) {
  console.error("classification mismatches", mismatch);
  process.exitCode = 1;
}
