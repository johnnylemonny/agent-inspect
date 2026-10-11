#!/usr/bin/env node
/**
 * F04 controlled OTLP identity evidence (Robb / Roy).
 * Captures real local runs, default OTLP export, round-trip contract parity.
 * Not Honeycomb/Refinery validation.
 *
 * Usage:
 *   pnpm build
 *   node scripts/f04-otlp-identity-evidence.mjs [output-dir]
 *
 * Default output: <repo>/tmp/f04-otlp-identity-evidence
 * Exit nonzero on source/round-trip contract mismatches.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outRoot = path.resolve(
  process.argv[2] ?? path.join(root, "tmp", "f04-otlp-identity-evidence"),
);

const require = createRequire(path.join(root, "packages/core/package.json"));
const dist = path.join(root, "packages/core/dist");
const { inspectRun, step } = await import(path.join(dist, "index.mjs"));
const { exportOtlpJson, manualTraceEventsToRunTree } = await import(
  path.join(dist, "exporters.mjs")
);
const { openTraceFile, openTraceText } = await import(path.join(dist, "readers.mjs"));
const { getCurrentRunId } = await import(path.join(dist, "advanced.mjs"));
const { defineTraceContract, evaluateTraceContract } = await import(
  path.join(dist, "checks.mjs")
);

fs.mkdirSync(outRoot, { recursive: true });

const maxOne = defineTraceContract({ retry: { maxAttempts: 1 } });
let failures = 0;

function fail(msg) {
  failures += 1;
  console.error(`[f04] FAIL: ${msg}`);
}

function countAttempts(read) {
  const tools = (read.events ?? []).filter(
    (e) => e && (e.kind === "TOOL" || e.type === "tool"),
  );
  const ids = new Set();
  for (const t of tools) {
    const attrs = t.attributes ?? t.metadata ?? {};
    const id =
      attrs.attemptId ??
      attrs["agent_inspect.attempt_id"] ??
      attrs.operationId ??
      attrs["agent_inspect.operation_id"] ??
      t.id ??
      t.stepId;
    if (id != null) ids.add(String(id));
    else ids.add(`anon:${ids.size}`);
  }
  return ids.size;
}

function countOperations(read) {
  const tools = (read.events ?? []).filter(
    (e) => e && (e.kind === "TOOL" || e.type === "tool"),
  );
  const ops = new Set();
  for (const t of tools) {
    const attrs = t.attributes ?? t.metadata ?? {};
    const id = attrs.operationId ?? attrs["agent_inspect.operation_id"];
    if (id != null) ops.add(String(id));
  }
  return ops.size;
}

async function capture(label, fn) {
  const traceDir = path.join(outRoot, "traces", label);
  fs.rmSync(traceDir, { recursive: true, force: true });
  fs.mkdirSync(traceDir, { recursive: true });
  let runId;
  await inspectRun(
    label,
    async () => {
      runId = getCurrentRunId();
      await fn();
    },
    { silent: true, traceDir },
  );
  const files = fs.readdirSync(traceDir).filter((f) => f.endsWith(".jsonl"));
  const sourcePath = path.join(traceDir, files[0]);
  const text = fs.readFileSync(sourcePath, "utf8");
  const events = text
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  const tree = manualTraceEventsToRunTree(events);
  const otlp = exportOtlpJson(tree);
  const otlpPath = path.join(outRoot, `${label}.default-otlp.json`);
  const jsonlCopy = path.join(outRoot, `${label}.source.jsonl`);
  fs.writeFileSync(jsonlCopy, text);
  fs.writeFileSync(otlpPath, otlp.content);
  const sourceRead = await openTraceFile(jsonlCopy);
  const otlpRead = await openTraceText(otlp.content);
  return { runId, sourcePath: jsonlCopy, otlpPath, events, otlp, sourceRead, otlpRead };
}

function toolAttempt(name, meta, body) {
  return step(
    name,
    async () => {
      if (typeof body === "function") return body();
      return { ok: true };
    },
    { type: "tool", metadata: { toolName: name, ...meta } },
  );
}

async function assertRoundTrip(label, captureResult, { expectFail = true } = {}) {
  const sourceEval = evaluateTraceContract({ read: captureResult.sourceRead }, maxOne);
  const otlpEval = evaluateTraceContract({ read: captureResult.otlpRead }, maxOne);
  const actual = {
    sourceStatus: sourceEval.status,
    otlpStatus: otlpEval.status,
    sourceFindings: sourceEval.findings.map((f) => f.ruleId),
    otlpFindings: otlpEval.findings.map((f) => f.ruleId),
  };
  fs.writeFileSync(
    path.join(outRoot, `${label}.contract-results.json`),
    JSON.stringify({ expectedFail: expectFail, ...actual }, null, 2) + "\n",
  );
  if (expectFail) {
    if (sourceEval.status !== "fail") fail(`${label}: source expected fail, got ${sourceEval.status}`);
    if (otlpEval.status !== "fail") fail(`${label}: OTLP round-trip expected fail, got ${otlpEval.status}`);
    const srcMax = sourceEval.findings.some((f) => f.ruleId === "contract.retry.max-attempts");
    const otlpMax = otlpEval.findings.some((f) => f.ruleId === "contract.retry.max-attempts");
    if (!srcMax) fail(`${label}: source missing max-attempts finding`);
    if (!otlpMax) fail(`${label}: OTLP round-trip missing max-attempts finding`);
  }
  return actual;
}

// O01 Robb: one op, two attempts, a2 retryOf a1
const o01 = await capture("O01-robb-one-op-two-attempts", async () => {
  await step("logical-retrieve", async () => {
    await toolAttempt("retrieve_policy", {
      operationId: "op1",
      attemptId: "a1",
      attemptNumber: 1,
    });
    await toolAttempt("retrieve_policy", {
      operationId: "op1",
      attemptId: "a2",
      attemptNumber: 2,
      retryOf: "a1",
    });
  });
});
await assertRoundTrip("O01-robb-one-op-two-attempts", o01);

// O02 Roy: actually throw 429 then timeout then success
const o02 = await capture("O02-roy-three-attempts", async () => {
  try {
    await toolAttempt(
      "retrieve_policy",
      { operationId: "op1", attemptId: "a1", attemptNumber: 1, httpStatus: 429 },
      async () => {
        const err = new Error("429 Too Many Requests");
        err.code = "HTTP_429";
        err.status = 429;
        throw err;
      },
    );
  } catch {
    /* retained failed attempt */
  }
  try {
    await toolAttempt(
      "retrieve_policy",
      {
        operationId: "op1",
        attemptId: "a2",
        attemptNumber: 2,
        retryOf: "a1",
        errorClass: "TIMEOUT",
      },
      async () => {
        const err = new Error("timeout");
        err.code = "TIMEOUT";
        throw err;
      },
    );
  } catch {
    /* retained */
  }
  await toolAttempt("retrieve_policy", {
    operationId: "op1",
    attemptId: "a3",
    attemptNumber: 3,
    retryOf: "a2",
  });
});
await assertRoundTrip("O02-roy-three-attempts", o02);

// O03 two operations × two attempts
const o03 = await capture("O03-two-ops-four-attempts", async () => {
  for (const op of ["op1", "op2"]) {
    await toolAttempt("retrieve_policy", {
      operationId: op,
      attemptId: `${op}-a1`,
      attemptNumber: 1,
    });
    await toolAttempt("retrieve_policy", {
      operationId: op,
      attemptId: `${op}-a2`,
      attemptNumber: 2,
      retryOf: `${op}-a1`,
    });
  }
});
await assertRoundTrip("O03-two-ops-four-attempts", o03);

// O04 second physical run reusing labels
const o04 = await capture("O04-second-physical-run", async () => {
  await toolAttempt("retrieve_policy", {
    operationId: "op1",
    attemptId: "a1",
    attemptNumber: 1,
  });
  await toolAttempt("retrieve_policy", {
    operationId: "op1",
    attemptId: "a2",
    attemptNumber: 2,
    retryOf: "a1",
  });
});
await assertRoundTrip("O04-second-physical-run", o04);
if (!(o01.runId !== o04.runId)) fail("O04: physical run ids must differ from O01");

// O05a: identity-collision negative — two handler executions reuse the same attemptId.
const o05collision = await capture("O05-identity-collision", async () => {
  await toolAttempt("retrieve_policy", {
    operationId: "op1",
    attemptId: "a1",
    attemptNumber: 1,
  });
  await toolAttempt("retrieve_policy", {
    operationId: "op1",
    attemptId: "a1",
    attemptNumber: 1,
  });
});
{
  const evalO05 = evaluateTraceContract({ read: o05collision.otlpRead }, maxOne);
  const hasDup = evalO05.findings.some(
    (f) =>
      f.ruleId === "contract.retry.duplicate-attempt-id" ||
      String(f.ruleId).includes("duplicate-attempt"),
  );
  fs.writeFileSync(
    path.join(outRoot, "O05-identity-collision.contract-results.json"),
    JSON.stringify(
      {
        note: "Two executions with the same attemptId — identity-collision negative (not repeated delivery).",
        status: evalO05.status,
        findings: evalO05.findings,
        assertedDuplicateDiagnostic: hasDup,
      },
      null,
      2,
    ) + "\n",
  );
  if (!hasDup && evalO05.status === "pass") {
    fail("O05-identity-collision: expected duplicate-attempt diagnostic or non-pass");
  }
}

// O05b: true repeated delivery — same persisted event identity twice, no second handler.
{
  const once = await capture("O05-repeated-delivery-base", async () => {
    await toolAttempt("retrieve_policy", {
      operationId: "op1",
      attemptId: "a1",
      attemptNumber: 1,
    });
    await toolAttempt("retrieve_policy", {
      operationId: "op1",
      attemptId: "a2",
      attemptNumber: 2,
      retryOf: "a1",
    });
  });
  const lines = once.events.map((e) => JSON.stringify(e));
  // Replay every persisted line twice without invoking handlers again.
  const duplicatedText = [...lines, ...lines].join("\n") + "\n";
  const replayPath = path.join(outRoot, "O05-repeated-delivery.source.jsonl");
  fs.writeFileSync(replayPath, duplicatedText);
  const tree = manualTraceEventsToRunTree(once.events.concat(once.events));
  const otlp = exportOtlpJson(tree);
  fs.writeFileSync(
    path.join(outRoot, "O05-repeated-delivery.default-otlp.json"),
    otlp.content,
  );
  const sourceRead = await openTraceFile(replayPath);
  const otlpRead = await openTraceText(otlp.content);
  const sourceEval = evaluateTraceContract({ read: sourceRead }, maxOne);
  const otlpEval = evaluateTraceContract({ read: otlpRead }, maxOne);
  const sourceAttempts = countAttempts(sourceRead);
  const otlpAttempts = countAttempts(otlpRead);
  fs.writeFileSync(
    path.join(outRoot, "O05-repeated-delivery.contract-results.json"),
    JSON.stringify(
      {
        note: "Repeated delivery of the same persisted events — distinct from two handler executions.",
        sourceStatus: sourceEval.status,
        otlpStatus: otlpEval.status,
        sourceAttemptCount: sourceAttempts,
        otlpAttemptCount: otlpAttempts,
        physicalEventRows: once.events.length * 2,
        uniqueLogicalAttemptsExpected: 2,
      },
      null,
      2,
    ) + "\n",
  );
  if (sourceEval.status !== otlpEval.status) {
    fail("O05-repeated-delivery: source/OTLP status mismatch");
  }
  // Repeated physical rows may inflate a naive source count; OTLP/logical
  // attempt identity after lifecycle collapse must stay at two distinct attempts.
  if (otlpAttempts !== 2) {
    fail(
      `O05-repeated-delivery: expected 2 logical attempts after collapse, got otlp=${otlpAttempts} sourceNaive=${sourceAttempts}`,
    );
  }
}

// O06 missing/partial identities remain unknown (no operationId → maxAttempts unevaluable)
const o06 = await capture("O06-partial-identity", async () => {
  await toolAttempt("retrieve_policy", { attemptNumber: 1 });
  await toolAttempt("retrieve_policy", {});
});
{
  const sourceEval = evaluateTraceContract({ read: o06.sourceRead }, maxOne);
  const otlpEval = evaluateTraceContract({ read: o06.otlpRead }, maxOne);
  const packetClassification =
    sourceEval.findings.some((f) => f.ruleId === "contract.retry.max-attempts")
      ? "engine_evaluated"
      : "unknown_unverifiable";
  fs.writeFileSync(
    path.join(outRoot, "O06-partial-identity.contract-results.json"),
    JSON.stringify(
      {
        note: "Without operationId, global maxAttempts does not invent a grouping; missing identity stays unknown/unverifiable at packet level.",
        sourceStatus: sourceEval.status,
        otlpStatus: otlpEval.status,
        packetClassification,
        operationCount: countOperations(o06.otlpRead),
        attemptCount: countAttempts(o06.otlpRead),
        physicalRunId: o06.runId,
      },
      null,
      2,
    ) + "\n",
  );
  if (sourceEval.status !== otlpEval.status) {
    fail("O06: source and OTLP round-trip statuses must match when identities are partial");
  }
  // Must not fabricate a max-attempts failure from tool name alone.
  if (otlpEval.findings.some((f) => f.ruleId === "contract.retry.max-attempts")) {
    fail("O06: must not invent max-attempts failure without operationId");
  }
  if (packetClassification !== "unknown_unverifiable") {
    fail("O06: packet-level classification must be unknown_unverifiable when identity missing");
  }
}

// O07 two ops with equal tool/args stay distinct
const o07 = await capture("O07-equal-args-distinct-ops", async () => {
  await toolAttempt("retrieve_policy", {
    operationId: "opA",
    attemptId: "a1",
    attemptNumber: 1,
    arguments: { policyId: "p" },
  });
  await toolAttempt("retrieve_policy", {
    operationId: "opB",
    attemptId: "b1",
    attemptNumber: 1,
    arguments: { policyId: "p" },
  });
});
{
  const tools = o07.otlpRead.events.filter((e) => e.kind === "TOOL");
  const ops = new Set(
    tools.map((t) => t.attributes?.operationId ?? t.attributes?.["agent_inspect.operation_id"]),
  );
  if (ops.size < 2) fail("O07: equal tool/args must retain distinct operationIds after round-trip");
}

function identityAttrs(otlpContent) {
  const parsed = JSON.parse(otlpContent);
  const spans = parsed.resourceSpans?.[0]?.scopeSpans?.[0]?.spans ?? [];
  return spans.map((s) => {
    const attrs = Object.fromEntries(
      (s.attributes ?? []).map((a) => [
        a.key,
        a.value?.stringValue ?? a.value?.intValue ?? a.value,
      ]),
    );
    return {
      name: s.name,
      parentSpanId: s.parentSpanId ?? null,
      operationId: attrs["agent_inspect.operation_id"] ?? null,
      attemptId: attrs["agent_inspect.attempt_id"] ?? null,
      retryOf: attrs["agent_inspect.retry_of"] ?? null,
      attemptNumber: attrs["agent_inspect.attempt_number"] ?? null,
      runId: attrs["agent_inspect.run_id"] ?? null,
    };
  });
}

const mapping = {
  fieldMapping: {
    "source metadata.operationId": "attributes.agent_inspect.operation_id → reader attributes.operationId",
    "source metadata.attemptId": "attributes.agent_inspect.attempt_id → reader attributes.attemptId",
    "source metadata.retryOf": "attributes.agent_inspect.retry_of → reader attributes.retryOf",
    "source metadata.attemptNumber|attempt":
      "attributes.agent_inspect.attempt_number → reader attributes.attemptNumber",
    "source parentId": "span.parentSpanId (hashed)",
    "source runId": "attributes.agent_inspect.run_id",
  },
  lossNotes: [
    "Raw dotted agent_inspect.* attrs are retained alongside promoted camelCase.",
    "Conflicting camelCase vs dotted values warn (otlp_identity_conflict) and keep camelCase.",
    "Identities are never inferred from tool name/arguments.",
  ],
  controls: {
    O01: identityAttrs(o01.otlp.content),
    O02: identityAttrs(o02.otlp.content),
    O03: identityAttrs(o03.otlp.content),
    O04: {
      runA: o01.runId,
      runB: o04.runId,
      distinctPhysicalRuns: o01.runId !== o04.runId,
      spans: identityAttrs(o04.otlp.content),
    },
    O05_identity_collision: identityAttrs(o05collision.otlp.content),
    O06: identityAttrs(o06.otlp.content),
    O07: identityAttrs(o07.otlp.content),
  },
  counts: {
    O01: {
      operations: countOperations(o01.otlpRead),
      attempts: countAttempts(o01.otlpRead),
      runId: o01.runId,
      retryLinks: identityAttrs(o01.otlp.content).filter((s) => s.retryOf),
    },
    O02: {
      operations: countOperations(o02.otlpRead),
      attempts: countAttempts(o02.otlpRead),
      runId: o02.runId,
      retryLinks: identityAttrs(o02.otlp.content).filter((s) => s.retryOf),
    },
    O03: {
      operations: countOperations(o03.otlpRead),
      attempts: countAttempts(o03.otlpRead),
      runId: o03.runId,
    },
    O04: {
      operations: countOperations(o04.otlpRead),
      attempts: countAttempts(o04.otlpRead),
      runId: o04.runId,
      distinctFromO01: o01.runId !== o04.runId,
    },
    O06: {
      operations: countOperations(o06.otlpRead),
      attempts: countAttempts(o06.otlpRead),
      runId: o06.runId,
    },
    O07: {
      operations: countOperations(o07.otlpRead),
      attempts: countAttempts(o07.otlpRead),
      runId: o07.runId,
    },
  },
};

fs.writeFileSync(
  path.join(outRoot, "mapping-and-loss-table.json"),
  JSON.stringify(mapping, null, 2) + "\n",
);

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const sha = require("node:child_process")
  .execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" })
  .trim();

fs.writeFileSync(
  path.join(outRoot, "README.md"),
  `# F04 — OTLP identity pair (Robb) + conformance vector (Roy)

**Exporter identity emission:** shipped in **agent-inspect@6.31.18** (\`agent_inspect.operation_id|attempt_id|retry_of|attempt_number\`).
**Reader promotion + round-trip contract parity:** this candidate (SHA \`${sha}\`, package string ${pkg.version}).
**Not** a Honeycomb/Refinery claim.

## Commands

\`\`\`bash
pnpm build
node scripts/f04-otlp-identity-evidence.mjs [output-dir]
pnpm exec vitest run packages/core/test/exporters/otlp-json-exporter.test.ts \\
  packages/core/test/readers/otlp-identity-roundtrip.test.ts
\`\`\`

Default output directory: \`tmp/f04-otlp-identity-evidence\` (or caller-specified path).

## Cases

| ID | Intent |
| --- | --- |
| O01 | One op / two attempts with retryOf; source≡OTLP fail maxAttempts:1 |
| O02 | Real throw 429 → timeout → success; identity chain retained |
| O03 | Two ops × two attempts |
| O04 | Separate physical run reusing local labels |
| O05-identity-collision | Two executions, same attemptId (negative) |
| O05-repeated-delivery | Same persisted events replayed (no second handler) |
| O06 | Partial/missing identities (packet unknown_unverifiable) |
| O07 | Equal tool/args, distinct operationIds |

## Mapping

See \`mapping-and-loss-table.json\` and per-case \`*.contract-results.json\`.
`,
);

const summary = {
  outRoot,
  packageVersion: pkg.version,
  sourceSha: sha,
  o01: o01.runId,
  o02: o02.runId,
  o04: o04.runId,
  distinctO01O04: o01.runId !== o04.runId,
  failures,
};
console.log(JSON.stringify(summary, null, 2));
if (failures > 0) process.exitCode = 1;
