/**
 * Femi four access/disclosure controls (W12) + wrong-join + persisted/share redaction.
 * Fixture enforces policy; AgentInspect observes. No real secrets.
 */
import path from "node:path";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

import { inspectRun, observeOutcome, step } from "agent-inspect";
import { redact } from "@agent-inspect/redact";

const silent = process.env.AGENT_INSPECT_SILENT === "true";
const baseDir = path.join(process.cwd(), ".agent-inspect-runs");

type Decision = "deny" | "allow" | "awaiting" | "missing";
type Class = "pass" | "awaiting" | "fail-prevention" | "unknown" | "fail-join";

const FAKE_MARKER = "MARKER_FIXTURE_CANARY_NOT_A_SECRET";

interface FixtureState {
  decision: Decision;
  invoked: boolean;
  readMarker: string | null;
  disclosureSink: string[];
  windowComplete: boolean;
  operationId: string;
  observedJoinOperationId: string;
}

/** Fixture-side policy gate — not AgentInspect enforcement. */
function fixtureDecide(decision: Decision): {
  mayInvoke: boolean;
  label: string;
} {
  if (decision === "allow") return { mayInvoke: true, label: "allowed" };
  if (decision === "awaiting")
    return { mayInvoke: false, label: "awaiting-approval" };
  if (decision === "deny") return { mayInvoke: false, label: "denied" };
  return { mayInvoke: false, label: "missing-decision" };
}

function classify(state: FixtureState): Class {
  if (state.decision === "missing" || !state.windowComplete) return "unknown";
  // Wrong-join: observer bound to a different operation/window than the invoke.
  if (state.observedJoinOperationId !== state.operationId) return "fail-join";
  if (state.decision === "awaiting") {
    return !state.invoked ? "awaiting" : "fail-prevention";
  }
  if (state.decision === "deny") {
    return !state.invoked ? "pass" : "fail-prevention";
  }
  // allowed: access-prevention must fail; disclosure sink may also fail never-disclosed.
  if (state.invoked && state.disclosureSink.includes(FAKE_MARKER)) {
    return "fail-prevention";
  }
  return state.invoked ? "fail-prevention" : "pass";
}

type CaseResult = { id: string; expected: Class; observed: Class };
const results: CaseResult[] = [];

async function runCase(
  id: string,
  expected: Class,
  setup: {
    decision: Decision;
    attemptInvoke: boolean;
    disclose: boolean;
    observe: boolean;
    /** Observer join operation id (defaults to the invoke operation). */
    observeOperationId?: string;
    embedCanaryInTrace?: boolean;
  },
): Promise<string | undefined> {
  const traceDir = path.join(baseDir, id);
  rmSync(traceDir, { recursive: true, force: true });
  mkdirSync(traceDir, { recursive: true });

  const operationId = "op_access";
  const state: FixtureState = {
    decision: setup.decision,
    invoked: false,
    readMarker: null,
    disclosureSink: [],
    windowComplete: false,
    operationId,
    observedJoinOperationId: setup.observeOperationId ?? operationId,
  };

  await inspectRun(
    id,
    async () => {
      const gate = fixtureDecide(setup.decision);
      await step(
        "access_request",
        async () => ({ resource: "fake-marker", decision: setup.decision }),
        {
          type: "logic",
          metadata: setup.embedCanaryInTrace
            ? { apiKey: FAKE_MARKER, password: FAKE_MARKER }
            : undefined,
        },
      );

      if (setup.decision !== "missing") {
        await step(
          "access_decision",
          async () => ({ verdict: gate.label, mayInvoke: gate.mayInvoke }),
          {
            type: "decision",
            metadata: {
              policyId: "fixture-access-1",
              decisionId: `dec-${id}`,
              verdict: gate.label,
              mode: "enforce",
            },
          },
        );
      }

      if (setup.attemptInvoke && gate.mayInvoke) {
        await step(
          "read_marker",
          async () => {
            state.invoked = true;
            state.readMarker = FAKE_MARKER;
            if (setup.disclose) {
              state.disclosureSink.push(FAKE_MARKER);
            }
            // Do not return the canary as tool output bytes — redaction claim is about
            // sensitive-key metadata on the persisted/share paths (P06), not payload capture.
            return {
              markerRef: "fixture-marker",
              disclosed: setup.disclose,
            };
          },
          {
            type: "tool",
            metadata: {
              toolName: "read_marker",
              operationId,
              ...(setup.embedCanaryInTrace
                ? { authorization: FAKE_MARKER, token: FAKE_MARKER }
                : {}),
            },
          },
        );
      } else if (setup.attemptInvoke && !gate.mayInvoke) {
        await step("skip_invoke", async () => ({ skipped: true, reason: gate.label }), {
          type: "logic",
        });
      }

      if (setup.observe) {
        const preventionHolds = !state.invoked;
        await observeOutcome("access-window", {
          expectation:
            setup.decision === "awaiting"
              ? "No invocation while awaiting approval"
              : "Access prevention / disclosure boundary observed",
          status: preventionHolds || setup.decision === "allow" ? "passed" : "failed",
          method: "custom",
          evidence: {
            decision: setup.decision,
            invoked: state.invoked,
            disclosureSinkCount: state.disclosureSink.length,
            join: {
              operationId: state.observedJoinOperationId,
              decisionId: `dec-${id}`,
            },
          },
        });
        state.windowComplete = true;
      }
    },
    { silent, traceDir },
  );

  const observed = classify(state);
  results.push({ id, expected, observed });
  console.log(`  ${id}: expected=${expected} observed=${observed}`);

  const files = readdirSync(traceDir).filter((f) => f.endsWith(".jsonl"));
  return files[0] ? path.join(traceDir, files[0]) : undefined;
}

console.log("access-disclosure-controls:");

await runCase("P01-denied-no-invoke", "pass", {
  decision: "deny",
  attemptInvoke: true,
  disclose: false,
  observe: true,
});

await runCase("P02-awaiting-approval", "awaiting", {
  decision: "awaiting",
  attemptInvoke: true,
  disclose: false,
  observe: true,
});

await runCase("P03-allowed-disclosed", "fail-prevention", {
  decision: "allow",
  attemptInvoke: true,
  disclose: true,
  observe: true,
});

await runCase("P04-incomplete-observer", "unknown", {
  decision: "deny",
  attemptInvoke: true,
  disclose: false,
  observe: false,
});

await runCase("P05-wrong-join", "fail-join", {
  decision: "deny",
  attemptInvoke: true,
  disclose: false,
  observe: true,
  observeOperationId: "op-OTHER-WINDOW",
});

// Redaction on the actual persisted JSONL path + share-profile export of that file.
const canaryTrace = await runCase("P06-redaction-persisted", "fail-prevention", {
  decision: "allow",
  attemptInvoke: true,
  disclose: true,
  observe: true,
  embedCanaryInTrace: true,
});

let beforeDiskOk = false;
let shareExportOk = false;
if (canaryTrace) {
  const persistedRaw = readFileSync(canaryTrace, "utf8");
  // P06 embeds the canary under sensitive keys (apiKey/authorization/token/password).
  // Persisted JSONL must not retain the canary (writer before-disk redaction path).
  beforeDiskOk = !persistedRaw.includes(FAKE_MARKER);
  const lines = persistedRaw
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  // Share/export path: share-profile redaction over the persisted rows plus sensitive keys.
  const shareExport = redact(
    {
      events: lines,
      apiKey: FAKE_MARKER,
      password: FAKE_MARKER,
      authorization: FAKE_MARKER,
      token: FAKE_MARKER,
    },
    { profile: "share" },
  );
  const shareText = JSON.stringify(shareExport.value);
  shareExportOk = !shareText.includes(FAKE_MARKER);
  const sharePath = path.join(path.dirname(canaryTrace), "share-export.json");
  writeFileSync(sharePath, shareText);
  console.log(
    `redaction-canary: beforeDisk=${beforeDiskOk} shareExport=${shareExportOk} sharePath=${path.basename(sharePath)}`,
  );
} else {
  console.log("redaction-canary: beforeDisk=false shareExport=false");
}

console.log(
  `classes: ${results.map((r) => `${r.id.slice(0, 3)}:${r.observed}`).join(",")}`,
);

const mismatch = results.filter((r) => r.expected !== r.observed);
if (mismatch.length || !beforeDiskOk || !shareExportOk) {
  console.error("classification or redaction mismatches", {
    mismatch,
    beforeDiskOk,
    shareExportOk,
  });
  process.exitCode = 1;
}
