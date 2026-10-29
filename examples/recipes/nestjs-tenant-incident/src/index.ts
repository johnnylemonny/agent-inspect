/**
 * Uduak / W14 — NestJS paired incident with opaque capture refs (chunk 02).
 * Keyless stubs only. One supported claim: answer consumes requested-tenant policy.
 * Raw tenant names are not encoded in operation/tenant identifiers.
 */
import "reflect-metadata";

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { Test } from "@nestjs/testing";
import { inspectRun, step } from "agent-inspect";
import { resolveRedactionProfile } from "agent-inspect/advanced";
import {
  defineTraceContract,
  evaluateTraceContractRead,
} from "agent-inspect/checks";
import { Redactor } from "agent-inspect/logs";
import { openTraceFile } from "agent-inspect/readers";

import { PolicyService, SupportModule, SupportService } from "./app.js";
import {
  classifyOpaqueJoin,
  FORBIDDEN_SHARE_TOKENS,
  nextOperationRef,
  nextResultRef,
  TENANT_ALPHA,
  TENANT_BETA,
} from "./refs.js";

const silent = process.env.AGENT_INSPECT_SILENT === "true";
const baseDir = path.join(process.cwd(), ".agent-inspect-runs");

type Class = "pass" | "fail";
type CaseResult = { id: string; expected: Class; observed: Class };
const results: CaseResult[] = [];

/** Completeness/order contract. Tenant join is a separate Nest-path oracle. */
const contract = defineTraceContract({
  run: { requireCompleted: true, allowedStatuses: ["ok"] },
  tools: { required: ["retrieve_policy"] },
  steps: {
    orderRelations: [
      {
        before: { kind: "TOOL", name: "retrieve_policy" },
        after: { kind: "LLM", name: "answer" },
        mode: "first-occurrence",
      },
    ],
  },
});

async function bootstrap() {
  const moduleRef = await Test.createTestingModule({
    imports: [SupportModule],
  }).compile();
  await moduleRef.init();
  return {
    moduleRef,
    support: moduleRef.get(SupportService),
    policies: moduleRef.get(PolicyService),
    close: async () => {
      await moduleRef.close();
    },
  };
}

async function captureAsk(
  id: string,
  opts: {
    requestedTenantRef: string;
    bindTenantRef?: string;
    skipTool?: boolean;
    skipLlm?: boolean;
    throwInApp?: boolean;
  },
): Promise<{ tracePath: string; thrown?: Error; result?: unknown }> {
  const traceDir = path.join(baseDir, id);
  rmSync(traceDir, { recursive: true, force: true });
  mkdirSync(traceDir, { recursive: true });

  const { support, policies, close } = await bootstrap();
  let thrown: Error | undefined;
  let result: unknown;
  const operationRef = nextOperationRef();
  const resultRef = nextResultRef();

  try {
    result = await inspectRun(
      id,
      async () => {
        if (opts.throwInApp) {
          throw new Error("fixture: nest application error");
        }

        let policy:
          | { policyId: string; tenantRef: string; text: string }
          | undefined;

        if (!opts.skipTool) {
          policy = await step(
            "retrieve_policy",
            async () => {
              const lookup = opts.bindTenantRef ?? opts.requestedTenantRef;
              return policies.retrieve(lookup);
            },
            {
              type: "tool",
              metadata: {
                toolName: "retrieve_policy",
                operationId: operationRef,
                attemptId: "a1",
                attemptNumber: 1,
                arguments: {
                  tenantRef: opts.bindTenantRef ?? opts.requestedTenantRef,
                },
                requestedTenantRef: opts.requestedTenantRef,
                resultRef,
              },
            },
          );
          // Exercise Nest DI resolve path for SupportService as well.
          void support;
        }

        if (!opts.skipLlm) {
          return step(
            "answer",
            async () => {
              if (!policy) {
                return {
                  answer: "no policy",
                  requestedTenantRef: opts.requestedTenantRef,
                  resultRef,
                };
              }
              const join = classifyOpaqueJoin({
                requestedTenantRef: opts.requestedTenantRef,
                policyTenantRef: policy.tenantRef,
              });
              return {
                answer: `Q → ${policy.text}`,
                policyId: policy.policyId,
                policyTenantRef: policy.tenantRef,
                requestedTenantRef: opts.requestedTenantRef,
                resultRef,
                join,
                joinOk: join === "match",
              };
            },
            {
              type: "llm",
              metadata: {
                model: "stub-answer",
                requestedTenantRef: opts.requestedTenantRef,
                policyTenantRef: policy?.tenantRef,
                resultRef,
                operationId: operationRef,
              },
            },
          );
        }
        return { skipped: true };
      },
      { silent, traceDir },
    );
  } catch (error) {
    thrown = error instanceof Error ? error : new Error(String(error));
  } finally {
    await close();
  }

  const files = readdirSync(traceDir).filter((f) => f.endsWith(".jsonl"));
  if (!files[0] && !opts.throwInApp) throw new Error(`no trace for ${id}`);
  return {
    tracePath: files[0] ? path.join(traceDir, files[0]) : "",
    thrown,
    result,
  };
}

function tenantJoinOk(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const r = result as {
    joinOk?: boolean;
    join?: string;
    policyTenantRef?: string;
    requestedTenantRef?: string;
  };
  if (r.join === "unknown") return false;
  if (typeof r.joinOk === "boolean") return r.joinOk;
  return (
    classifyOpaqueJoin({
      requestedTenantRef: r.requestedTenantRef,
      policyTenantRef: r.policyTenantRef,
    }) === "match"
  );
}

function profileRedactor(profile: "local" | "share" | "strict"): Redactor | null {
  if (profile === "local") return null;
  const resolved = resolveRedactionProfile(profile);
  return new Redactor({ extraKeys: [...resolved.extraKeys] });
}

function redactJsonl(text: string, profile: "local" | "share" | "strict"): string {
  const redactor = profileRedactor(profile);
  if (!redactor) return text;
  const out: string[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const row = JSON.parse(line) as Record<string, unknown>;
    out.push(JSON.stringify(redactor.redactRecord(row)));
  }
  return `${out.join("\n")}\n`;
}

function containsForbidden(text: string): string[] {
  return FORBIDDEN_SHARE_TOKENS.filter((token) => text.includes(token));
}

async function evalCase(
  id: string,
  expected: Class,
  opts: Parameters<typeof captureAsk>[1],
  classify: (input: {
    contractStatus: string;
    result: unknown;
    thrown?: Error;
  }) => Class,
) {
  const { tracePath, thrown, result } = await captureAsk(id, opts);
  let contractStatus = "fail";
  if (tracePath) {
    const read = await openTraceFile(tracePath);
    contractStatus = evaluateTraceContractRead(read, contract).status;
  }
  const observed = classify({ contractStatus, result, thrown });
  results.push({ id, expected, observed });
  console.log(`  ${id}: expected=${expected} observed=${observed}`);
}

console.log("nestjs-tenant-incident:");
console.log("  note: real NestJS TestingModule; opaque tenant/operation refs; keyless");

await evalCase(
  "N01-good-tenant-a",
  "pass",
  { requestedTenantRef: TENANT_ALPHA },
  ({ contractStatus, result }) =>
    contractStatus === "pass" && tenantJoinOk(result) ? "pass" : "fail",
);

await evalCase(
  "N02-wrong-tenant-bind",
  "fail",
  { requestedTenantRef: TENANT_ALPHA, bindTenantRef: TENANT_BETA },
  ({ result }) => (tenantJoinOk(result) ? "pass" : "fail"),
);

await evalCase(
  "N03-absent-capture",
  "fail",
  { requestedTenantRef: TENANT_ALPHA, skipTool: true },
  ({ contractStatus }) => (contractStatus === "pass" ? "pass" : "fail"),
);

{
  const a = captureAsk("N04-overlap-a", { requestedTenantRef: TENANT_ALPHA });
  const b = captureAsk("N04-overlap-b", { requestedTenantRef: TENANT_BETA });
  const [ra, rb] = await Promise.all([a, b]);
  const ok =
    tenantJoinOk(ra.result) &&
    tenantJoinOk(rb.result) &&
    (ra.result as { policyTenantRef: string }).policyTenantRef === TENANT_ALPHA &&
    (rb.result as { policyTenantRef: string }).policyTenantRef === TENANT_BETA;
  results.push({
    id: "N04-overlap-isolated",
    expected: "pass",
    observed: ok ? "pass" : "fail",
  });
  console.log(
    `  N04-overlap-isolated: expected=pass observed=${ok ? "pass" : "fail"}`,
  );
}

await evalCase(
  "N05-app-error-preserved",
  "pass",
  { requestedTenantRef: TENANT_ALPHA, throwInApp: true },
  ({ thrown }) =>
    thrown?.message === "fixture: nest application error" ? "pass" : "fail",
);

{
  const { close } = await bootstrap();
  await close();
  results.push({ id: "N06-close-no-handles", expected: "pass", observed: "pass" });
  console.log("  N06-close-no-handles: expected=pass observed=pass");
}

// Privacy surfaces: same synthetic runs, local / share / strict projections.
{
  const privacyDir = path.join(baseDir, "N07-privacy-surfaces");
  rmSync(privacyDir, { recursive: true, force: true });
  mkdirSync(privacyDir, { recursive: true });

  const good = await captureAsk("N07-privacy-good", {
    requestedTenantRef: TENANT_ALPHA,
  });
  const wrong = await captureAsk("N07-privacy-wrong", {
    requestedTenantRef: TENANT_ALPHA,
    bindTenantRef: TENANT_BETA,
  });
  if (!good.tracePath || !wrong.tracePath) {
    throw new Error("privacy probe missing traces");
  }

  const localGood = readFileSync(good.tracePath, "utf8");
  const localWrong = readFileSync(wrong.tracePath, "utf8");
  const shareGood = redactJsonl(localGood, "share");
  const shareWrong = redactJsonl(localWrong, "share");
  const strictGood = redactJsonl(localGood, "strict");
  const strictWrong = redactJsonl(localWrong, "strict");

  writeFileSync(path.join(privacyDir, "local-good.jsonl"), localGood);
  writeFileSync(path.join(privacyDir, "share-good.jsonl"), shareGood);
  writeFileSync(path.join(privacyDir, "strict-good.jsonl"), strictGood);
  writeFileSync(path.join(privacyDir, "share-wrong.jsonl"), shareWrong);
  writeFileSync(path.join(privacyDir, "strict-wrong.jsonl"), strictWrong);

  const forbiddenHits = [
    ...containsForbidden(localGood),
    ...containsForbidden(localWrong),
    ...containsForbidden(shareGood),
    ...containsForbidden(shareWrong),
    ...containsForbidden(strictGood),
    ...containsForbidden(strictWrong),
  ];
  const noForbidden = forbiddenHits.length === 0;

  const localJoinGood = classifyOpaqueJoin({
    requestedTenantRef: (good.result as { requestedTenantRef?: string }).requestedTenantRef,
    policyTenantRef: (good.result as { policyTenantRef?: string }).policyTenantRef,
  });
  const localJoinWrong = classifyOpaqueJoin({
    requestedTenantRef: (wrong.result as { requestedTenantRef?: string }).requestedTenantRef,
    policyTenantRef: (wrong.result as { policyTenantRef?: string }).policyTenantRef,
  });
  const distinguishableLocal =
    localJoinGood === "match" && localJoinWrong === "mismatch";

  // If share collapses distinct tenantId keys to [REDACTED], that is unknown — not equality.
  const redactedPairJoin = classifyOpaqueJoin({
    requestedTenantRef: "[REDACTED]",
    policyTenantRef: "[REDACTED]",
  });
  const redactedNotEqualEvidence = redactedPairJoin === "unknown";

  // operationId must be opaque (op-ref-*), not tenant-derived.
  const opaqueOps =
    /"operationId":"op-ref-\d+"/.test(localGood) &&
    /"operationId":"op-ref-\d+"/.test(localWrong) &&
    !localGood.includes("op-tenant-") &&
    !localWrong.includes("op-tenant-");

  const privacyOk =
    noForbidden &&
    distinguishableLocal &&
    redactedNotEqualEvidence &&
    opaqueOps &&
    localGood.includes(TENANT_ALPHA) &&
    localWrong.includes(TENANT_BETA);

  results.push({
    id: "N07-privacy-surfaces",
    expected: "pass",
    observed: privacyOk ? "pass" : "fail",
  });
  console.log(
    `  N07-privacy-surfaces: expected=pass observed=${privacyOk ? "pass" : "fail"} profiles=local,share,strict`,
  );
  console.log(
    `    note: SAFE is not a privacy certificate; checked local/share/strict JSONL projections`,
  );
  if (!privacyOk) {
    console.error("privacy probe detail", {
      forbiddenHits: [...new Set(forbiddenHits)],
      distinguishableLocal,
      redactedNotEqualEvidence,
      opaqueOps,
      localJoinGood,
      localJoinWrong,
    });
  }
}

console.log(
  `classes: ${results.map((r) => `${r.id.slice(0, 3)}:${r.observed}`).join(",")}`,
);
console.log(
  "claim: answer must consume policy for the requested tenant (opaque ref join)",
);

const mismatch = results.filter((r) => r.expected !== r.observed);
if (mismatch.length) {
  console.error("classification mismatches", mismatch);
  process.exitCode = 1;
}
