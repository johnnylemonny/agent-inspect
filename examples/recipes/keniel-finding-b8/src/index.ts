/**
 * Keniel finding-B8 public-record map (W07).
 * Frozen fixture only — no network at runtime.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { MappingLedger } from "agent-inspect/readers";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(here, "..", "fixture");

type Class = "pass" | "fail" | "unknown";

interface FinderRef {
  _key: string;
  _ref: string;
  _type: string;
}

interface FindingB8 {
  _id: string;
  status: string;
  foundBy: FinderRef[];
  commentIds: string[];
  commentId: string | null | undefined;
  commentOn: { _ref: string; _type: string };
  [key: string]: unknown;
}

type ReceiptStatus =
  | "found"
  | "not_found_in_search"
  | "unmatched_join";

interface ReceiptSearch {
  finderRef: string;
  status: ReceiptStatus;
  receiptId?: string;
  /** reported correspondence evidence vs independently resolved live proof */
  evidenceClass?: "reported_locatable" | "independently_resolved";
  joinDiagnostic?: string;
}

/** Correspondence-supported receipt join keys (not finder-only). */
const CORRESPONDENCE_RECEIPT = {
  finderRef: "person-pushpendra",
  commentId: "3ee98",
  articleRef: "article-4590564",
  receiptId: "receipt-pushpendra-B8",
} as const;

const MAPPING_LEDGER: MappingLedger = {
  id: "keniel-finding-b8-to-local-map",
  sourceFormat: "sanity-finding-json",
  targetFormat: "agent-inspect-local-fixture-map",
  convention: {
    name: "keniel-public-finding-B8",
    version: "frozen-fixture",
  },
  entries: [
    {
      source: "status",
      target: "finding.status",
      transformation: "identity",
      confidence: "explicit",
      loss: "none",
    },
    {
      source: "foundBy[]",
      target: "finders[]",
      transformation: "preserve-array-of-refs",
      confidence: "explicit",
      loss: "none",
    },
    {
      source: "commentIds",
      target: "comments.ids",
      transformation: "identity-array",
      confidence: "explicit",
      loss: "none",
    },
    {
      source: "commentId",
      target: "comments.singularId",
      transformation: "preserve-null-independently",
      confidence: "explicit",
      loss: "none",
    },
    {
      source: "commentOn._ref",
      target: "article.ref",
      transformation: "identity",
      confidence: "explicit",
      loss: "none",
    },
    {
      source: "finder+commentIds+article→receipt",
      target: "receipts[].status",
      transformation:
        "join requires finder+comment+article; not_found≠zero-proof; unmatched≠found",
      confidence: "correlated",
      loss: "unsupported",
    },
    {
      source: "_createdAt/_updatedAt",
      target: "timing.sourceOnly",
      transformation: "retain-source-timestamps; no fake tool timing",
      confidence: "explicit",
      loss: "kind-degraded",
    },
  ],
  knownLosses: [
    "Native tool/step timing is unavailable from this public finding record.",
    "Two finder receipts were searched and not found — unknown evidence, not proof of zero contribution.",
    "Found receipt is correspondence-reported/locatable, not independently fetched live proof.",
  ],
};

function loadFinding(): FindingB8 {
  return JSON.parse(
    readFileSync(path.join(fixtureDir, "finding-B8.result.json"), "utf8"),
  ) as FindingB8;
}

/**
 * Join receipts to the finding's commentIds + article + finder.
 * Finder-only lookup is insufficient — wrong/missing commentIds or article
 * must not emit a found receipt.
 */
function searchReceipts(
  finders: FinderRef[],
  commentIds: string[],
  articleRef: string | undefined,
): ReceiptSearch[] {
  const commentOk = commentIds.includes(CORRESPONDENCE_RECEIPT.commentId);
  const articleOk = articleRef === CORRESPONDENCE_RECEIPT.articleRef;

  return finders.map((f) => {
    if (f._ref !== CORRESPONDENCE_RECEIPT.finderRef) {
      return { finderRef: f._ref, status: "not_found_in_search" };
    }
    if (!commentOk || !articleOk) {
      const reasons: string[] = [];
      if (!commentOk) {
        reasons.push(
          commentIds.length === 0
            ? "missing commentIds"
            : "commentIds do not include 3ee98",
        );
      }
      if (!articleOk) reasons.push("article ref unmatched");
      return {
        finderRef: f._ref,
        status: "unmatched_join",
        joinDiagnostic: reasons.join("; "),
      };
    }
    return {
      finderRef: f._ref,
      status: "found",
      receiptId: CORRESPONDENCE_RECEIPT.receiptId,
      evidenceClass: "reported_locatable",
    };
  });
}

function mapFinding(finding: FindingB8) {
  // Never backfill singular commentId from commentIds[0].
  // Absence (key omitted) and explicit null are distinct provenance states.
  const hasCommentIdKey = Object.prototype.hasOwnProperty.call(
    finding,
    "commentId",
  );
  const commentIdPresence: "absent" | "null" | "present" = !hasCommentIdKey
    ? "absent"
    : finding.commentId === null
      ? "null"
      : "present";
  const singular =
    commentIdPresence === "present" && typeof finding.commentId === "string"
      ? finding.commentId
      : null;

  const articleRef = finding.commentOn?._ref;
  const commentIds = Array.isArray(finding.commentIds)
    ? [...finding.commentIds]
    : [];
  const receipts = searchReceipts(finding.foundBy, commentIds, articleRef);

  // sourceCommentId only when the join validates comment 3ee98 on this finding.
  const joinFound = receipts.some(
    (r) =>
      r.status === "found" &&
      r.finderRef === CORRESPONDENCE_RECEIPT.finderRef &&
      commentIds.includes(CORRESPONDENCE_RECEIPT.commentId),
  );
  const sourceCommentId = joinFound ? CORRESPONDENCE_RECEIPT.commentId : null;

  const unknownAttrs = Object.fromEntries(
    Object.entries(finding).filter(
      ([k]) =>
        ![
          "_id",
          "status",
          "foundBy",
          "commentIds",
          "commentId",
          "commentOn",
          "code",
          "title",
          "_type",
          "_rev",
          "_createdAt",
          "_updatedAt",
        ].includes(k),
    ),
  );
  return {
    findingId: finding._id,
    status: finding.status,
    finders: finding.foundBy.map((f) => f._ref),
    commentIds,
    commentId: singular,
    commentIdPresence,
    sourceCommentId,
    articleRef,
    expectedArticleRef: CORRESPONDENCE_RECEIPT.articleRef,
    receipts,
    unknownAttributes: unknownAttrs,
    sourceTiming: {
      createdAt: finding._createdAt,
      updatedAt: finding._updatedAt,
    },
    mappingLedgerId: MAPPING_LEDGER.id,
  };
}

type CaseResult = { id: string; expected: Class; observed: Class };
const results: CaseResult[] = [];

function check(id: string, expected: Class, observed: Class) {
  results.push({ id, expected, observed });
  console.log(`  ${id}: expected=${expected} observed=${observed}`);
}

console.log("keniel-finding-b8:");

const frozenBytes = readFileSync(path.join(fixtureDir, "finding-B8.json"));
const digest = createHash("sha256").update(frozenBytes).digest("hex");
const recorded = readFileSync(
  path.join(fixtureDir, "finding-B8.sha256.txt"),
  "utf8",
)
  .trim()
  .split(/\s+/)[0];
if (digest !== recorded) {
  console.error("fixture digest drift", { digest, recorded });
  process.exitCode = 1;
}

const base = loadFinding();
const mapped = mapFinding(base);

// K01: 3 finders, exactly 1 locatable receipt (Pushpendra via comment+article join)
check(
  "K01-3finder-1receipt",
  "pass",
  mapped.finders.length === 3 &&
    mapped.receipts.filter((r) => r.status === "found").length === 1 &&
    mapped.receipts.find((r) => r.status === "found")?.finderRef ===
      "person-pushpendra" &&
    mapped.receipts.find((r) => r.status === "found")?.evidenceClass ===
      "reported_locatable" &&
    mapped.status === "unbuilt"
    ? "pass"
    : "fail",
);

// K02: frozen record omits commentId (absence ≠ explicit null); commentIds keeps 3ee98
check(
  "K02-singular-absent",
  "pass",
  mapped.commentIdPresence === "absent" &&
    mapped.commentId === null &&
    mapped.commentIds.length === 1 &&
    mapped.commentIds[0] === "3ee98" &&
    mapped.sourceCommentId === "3ee98" &&
    mapped.articleRef === "article-4590564"
    ? "pass"
    : "fail",
);

// K02b: explicit null is a distinct provenance state from key absence
const explicitNull = mapFinding({ ...base, commentId: null });
check(
  "K02b-explicit-null",
  "pass",
  explicitNull.commentIdPresence === "null" &&
    explicitNull.commentId === null &&
    mapped.commentIdPresence === "absent" &&
    explicitNull.commentIdPresence !== mapped.commentIdPresence
    ? "pass"
    : "fail",
);

// K03: wrong article → unmatched join, never a found receipt
const wrongArticle = mapFinding({
  ...base,
  commentOn: { _ref: "article-WRONG", _type: "reference" },
});
check(
  "K03-wrong-article",
  "unknown",
  wrongArticle.receipts.every((r) => r.status !== "found") &&
    wrongArticle.receipts.some((r) => r.status === "unmatched_join") &&
    wrongArticle.sourceCommentId === null
    ? "unknown"
    : "fail",
);

// K03b: wrong singular commentId must not backfill from commentIds or stand in for join
const wrongCommentJoin = mapFinding({
  ...base,
  commentId: "comment-WRONG",
  commentIds: ["3ee98"],
});
check(
  "K03b-wrong-comment-join",
  "fail",
  // Pass only if we incorrectly collapsed singular to source comment 3ee98.
  wrongCommentJoin.commentId === "3ee98" ? "pass" : "fail",
);

// K03c: wrong commentIds → no found receipt
const wrongCommentIds = mapFinding({
  ...base,
  commentIds: ["comment-WRONG"],
});
check(
  "K03c-wrong-commentIds",
  "unknown",
  wrongCommentIds.receipts.every((r) => r.status !== "found") &&
    wrongCommentIds.sourceCommentId === null
    ? "unknown"
    : "fail",
);

// K03d: missing commentIds → no found receipt
const missingCommentIds = mapFinding({ ...base, commentIds: [] });
check(
  "K03d-missing-commentIds",
  "unknown",
  missingCommentIds.receipts.every((r) => r.status !== "found") &&
    missingCommentIds.sourceCommentId === null
    ? "unknown"
    : "fail",
);

// K04: searched-but-not-found for other finders (not zero-proof)
check(
  "K04-missing-receipt",
  "unknown",
  mapped.receipts.filter((r) => r.status === "not_found_in_search").length ===
    2
    ? "unknown"
    : "fail",
);

// K05: known nonmatching reference among finders
check(
  "K05-nonmatching-ref",
  "fail",
  mapped.finders.includes("person-not-in-record") ? "pass" : "fail",
);

// K06: source unavailable
check(
  "K06-source-unavailable",
  "unknown",
  (() => {
    try {
      mapFinding(null as unknown as FindingB8);
      return "fail";
    } catch {
      return "unknown";
    }
  })(),
);

// K07: unknown additional fields retained (e.g. handed)
check(
  "K07-unknown-fields-retained",
  "pass",
  Object.prototype.hasOwnProperty.call(mapped.unknownAttributes, "handed")
    ? "pass"
    : "fail",
);

const found = mapped.receipts.filter((r) => r.status === "found").length;
const unknownSearch = mapped.receipts.filter(
  (r) => r.status === "not_found_in_search",
).length;

console.log(
  `classes: ${results.map((r) => `${r.id.slice(0, 3)}:${r.observed}`).join(",")}`,
);
console.log(`receipts: found=${found} unknownSearch=${unknownSearch}`);

const mismatch = results.filter((r) => r.expected !== r.observed);
if (mismatch.length) {
  console.error("classification mismatches", mismatch);
  process.exitCode = 1;
}
