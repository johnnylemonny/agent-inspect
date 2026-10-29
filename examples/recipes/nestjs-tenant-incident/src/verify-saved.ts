/**
 * Tenant-consumption verdicts from reopened JSONL only.
 * Does not import handlers or trust in-memory joinOk / expected labels.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { classifyOpaqueJoin } from "./refs.js";

export type ConsumptionClass = "pass" | "fail" | "unknown";

export interface ConsumptionVerdict {
  class: ConsumptionClass;
  contractNote: string;
  declaredTenantRef?: string;
  retrievedTenantRef?: string;
  consumedTenantRef?: string;
  resultRef?: string;
  join: "match" | "mismatch" | "unknown";
  retrievalPresent: boolean;
  consumptionPresent: boolean;
  commitmentMatch: boolean | "unknown";
  detail: string;
}

interface Row {
  event?: string;
  name?: string;
  status?: string;
  evidence?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function readRows(traceDirOrFile: string): Row[] {
  const rows: Row[] = [];
  const files = traceDirOrFile.endsWith(".jsonl")
    ? [traceDirOrFile]
    : readdirSync(traceDirOrFile)
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => path.join(traceDirOrFile, f));
  for (const file of files) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (line.trim() === "") continue;
      rows.push(JSON.parse(line) as Row);
    }
  }
  return rows;
}

function outcome(rows: Row[], name: string): Row | undefined {
  return rows.find((r) => r.event === "outcome_observed" && r.name === name);
}

export function sha256(bytes: string): string {
  return createHash("sha256").update(bytes, "utf8").digest("hex");
}

/**
 * Score tenant consumption from saved outcomes.
 * Structural TraceContract status is reported separately and is not this oracle.
 */
export function verifyConsumption(traceDirOrFile: string): ConsumptionVerdict {
  const rows = readRows(traceDirOrFile);
  const declared = outcome(rows, "declared-tenant-context");
  const retrieved = outcome(rows, "policy-retrieval");
  const consumed = outcome(rows, "policy-consumption");

  const declaredTenantRef = text(declared?.evidence?.requestedTenantRef);
  const retrievedTenantRef = text(retrieved?.evidence?.policyTenantRef);
  const consumedTenantRef = text(consumed?.evidence?.policyTenantRef);
  const resultRef = text(consumed?.evidence?.resultRef);
  const declaredResultRef = text(declared?.evidence?.resultRef);
  const retrievedCommitment = text(retrieved?.evidence?.policyCommitment);
  const consumedCommitment = text(consumed?.evidence?.consumedPolicyCommitment);

  const retrievalPresent = Boolean(retrieved && retrievedTenantRef);
  const consumptionPresent = Boolean(consumed && consumedTenantRef && resultRef);

  let commitmentMatch: boolean | "unknown" = "unknown";
  if (retrievedCommitment && consumedCommitment) {
    commitmentMatch = retrievedCommitment === consumedCommitment;
  }

  if (!declaredTenantRef) {
    return {
      class: "unknown",
      contractNote: "structural TraceContract is not a tenant-consumption oracle",
      join: "unknown",
      retrievalPresent,
      consumptionPresent,
      commitmentMatch,
      detail: "missing declared-tenant-context outcome",
    };
  }

  if (!retrievalPresent) {
    return {
      class: "fail",
      contractNote: "structural TraceContract is not a tenant-consumption oracle",
      declaredTenantRef,
      join: "unknown",
      retrievalPresent: false,
      consumptionPresent,
      commitmentMatch,
      detail: "missing policy retrieval evidence",
    };
  }

  if (!consumptionPresent) {
    return {
      class: "fail",
      contractNote: "structural TraceContract is not a tenant-consumption oracle",
      declaredTenantRef,
      retrievedTenantRef,
      join: "unknown",
      retrievalPresent: true,
      consumptionPresent: false,
      commitmentMatch,
      detail: "missing policy consumption evidence",
    };
  }

  if (declaredResultRef && resultRef && declaredResultRef !== resultRef) {
    return {
      class: "fail",
      contractNote: "structural TraceContract is not a tenant-consumption oracle",
      declaredTenantRef,
      retrievedTenantRef,
      consumedTenantRef,
      resultRef,
      join: "unknown",
      retrievalPresent: true,
      consumptionPresent: true,
      commitmentMatch,
      detail: "resultRef does not match declared result reference",
    };
  }

  if (commitmentMatch === false) {
    return {
      class: "fail",
      contractNote: "structural TraceContract is not a tenant-consumption oracle",
      declaredTenantRef,
      retrievedTenantRef,
      consumedTenantRef,
      resultRef,
      join: classifyOpaqueJoin({
        requestedTenantRef: declaredTenantRef,
        policyTenantRef: consumedTenantRef,
      }),
      retrievalPresent: true,
      consumptionPresent: true,
      commitmentMatch: false,
      detail: "answer did not consume the retrieved policy commitment",
    };
  }

  const join = classifyOpaqueJoin({
    requestedTenantRef: declaredTenantRef,
    policyTenantRef: consumedTenantRef,
  });

  if (join === "match" && commitmentMatch === true) {
    return {
      class: "pass",
      contractNote: "structural TraceContract is not a tenant-consumption oracle",
      declaredTenantRef,
      retrievedTenantRef,
      consumedTenantRef,
      resultRef,
      join,
      retrievalPresent: true,
      consumptionPresent: true,
      commitmentMatch: true,
      detail: "declared tenant matches consumed policy commitment",
    };
  }

  if (join === "mismatch") {
    return {
      class: "fail",
      contractNote: "structural TraceContract is not a tenant-consumption oracle",
      declaredTenantRef,
      retrievedTenantRef,
      consumedTenantRef,
      resultRef,
      join,
      retrievalPresent: true,
      consumptionPresent: true,
      commitmentMatch,
      detail: "consumed policy tenant does not match declared request",
    };
  }

  return {
    class: "unknown",
    contractNote: "structural TraceContract is not a tenant-consumption oracle",
    declaredTenantRef,
    retrievedTenantRef,
    consumedTenantRef,
    resultRef,
    join,
    retrievalPresent,
    consumptionPresent,
    commitmentMatch,
    detail: "consumption relation unverifiable from saved evidence",
  };
}
