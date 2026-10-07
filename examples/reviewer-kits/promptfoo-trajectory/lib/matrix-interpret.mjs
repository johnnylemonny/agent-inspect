/**
 * Shared Promptfoo matrix interpreter for recipe + standalone reviewer kit.
 * Keep both copies byte-identical (see matrix-interpret.test.mjs parity).
 *
 * Synthetic controls exercise this module; actual Promptfoo CLI eval is a
 * separate positive control and must not be labeled offline-success when blocked.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

/** Promptfoo exit when assertions fail but eval completed (pinned 0.118.17). */
export const EXPECTED_TEST_FAILURE_EXIT = 100;

export const PINNED_PROMPTFOO_VERSION = "0.118.17";

/** Stable case identities (prefer vars.caseId; fall back to exact description). */
export const CASE_SPECS = Object.freeze({
  correct: {
    caseId: "correct-tool",
    description: "correct path — answer pass, trajectory pass",
  },
  wrong: {
    caseId: "wrong-tool",
    description: "wrong path — answer pass, trajectory fail",
  },
  missing: {
    caseId: "missing-metadata",
    description: "missing run metadata must never pass trajectory",
  },
});

const ANSWER_ASSERT_VALUE = "You have 2 orders";
const TRAJECTORY_ASSERT_MARKERS = Object.freeze([
  "assert-trajectory.mjs",
  "assert-missing-metadata.mjs",
]);

export function createInvocationWorkspace(parentDir, label = "pf") {
  const invocationId = `${label}-${Date.now()}-${randomBytes(4).toString("hex")}`;
  const dir = path.join(parentDir, invocationId);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return {
    invocationId,
    dir,
    resultsPath: path.join(dir, "promptfoo-results.json"),
    summaryPath: path.join(dir, "matrix-summary.json"),
  };
}

/**
 * Classify child process outcome before reading any results file.
 * @param {{ status: number|null, error?: Error|null, signal?: string|null, timedOut?: boolean }} child
 */
export function classifyChildProcess(child) {
  if (child.timedOut) {
    return {
      kind: "infra_error",
      message: "promptfoo eval timed out; results from this invocation are not trusted",
    };
  }
  if (child.error) {
    return {
      kind: "infra_error",
      message: `promptfoo spawn failed: ${child.error.message}`,
    };
  }
  if (child.signal) {
    return {
      kind: "infra_error",
      message: `promptfoo killed by signal ${child.signal}; results are not trusted`,
    };
  }
  if (child.status === 0) {
    return { kind: "success_exit", message: "promptfoo exited 0" };
  }
  if (child.status === EXPECTED_TEST_FAILURE_EXIT) {
    return {
      kind: "expected_test_failure_exit",
      message: `promptfoo exited ${EXPECTED_TEST_FAILURE_EXIT} (declared test-failure exit); matrix still required`,
    };
  }
  if (child.status === null) {
    return {
      kind: "infra_error",
      message: "promptfoo produced no exit status; results are not trusted",
    };
  }
  return {
    kind: "infra_error",
    message: `promptfoo exited ${child.status} (not the declared test-failure exit ${EXPECTED_TEST_FAILURE_EXIT}); do not reuse prior results`,
  };
}

export function extractRows(results) {
  if (Array.isArray(results?.results) && results.results.length > 0) {
    return results.results;
  }
  if (Array.isArray(results) && results.length > 0) {
    return results;
  }
  const nested =
    results?.results?.results ??
    results?.results?.table ??
    results?.table ??
    [];
  return Array.isArray(nested) ? nested : [];
}

function rowCaseId(row) {
  const vars = row?.vars ?? row?.testCase?.vars ?? {};
  if (typeof vars.caseId === "string" && vars.caseId.trim() !== "") {
    return vars.caseId.trim();
  }
  return undefined;
}

function rowDescription(row) {
  return (
    row?.description ??
    row?.testCase?.description ??
    (typeof row?.vars?.path === "string" ? `path:${row.vars.path}` : undefined)
  );
}

export function findCaseRow(rows, spec) {
  const byId = rows.filter((row) => rowCaseId(row) === spec.caseId);
  if (byId.length === 1) return { row: byId[0], via: "caseId" };
  if (byId.length > 1) {
    return {
      error: `duplicate caseId "${spec.caseId}" (${byId.length} rows)`,
    };
  }
  const byDesc = rows.filter((row) => rowDescription(row) === spec.description);
  if (byDesc.length === 1) return { row: byDesc[0], via: "description" };
  if (byDesc.length > 1) {
    return {
      error: `duplicate description "${spec.description}" (${byDesc.length} rows)`,
    };
  }
  return {
    error: `missing case "${spec.caseId}" / "${spec.description}"`,
  };
}

function componentResults(row) {
  const list = row?.gradingResult?.componentResults;
  return Array.isArray(list) ? list : [];
}

function assertionType(c) {
  return String(c?.assertion?.type ?? c?.type ?? "");
}

function assertionValue(c) {
  return String(c?.assertion?.value ?? c?.value ?? "");
}

function assertionReason(c) {
  return String(c?.reason ?? "");
}

/** Exact equals answer assertion identity (type + bound target value). */
function isAnswerComponent(c) {
  return (
    assertionType(c) === "equals" && assertionValue(c) === ANSWER_ASSERT_VALUE
  );
}

function isInfrastructureFailureReason(reason) {
  const text = String(reason ?? "");
  return (
    /SyntaxError|TypeError|ReferenceError|required environment variable|ENOENT|EACCES|spawn |timed out|assertion script/i.test(
      text,
    )
  );
}

/** Missing-metadata case identity — must not satisfy wrong-tool tool-contract. */
function isMissingMetadataReason(reason) {
  return /missing metadata|missing run metadata|exact run required/i.test(
    String(reason ?? ""),
  );
}

/** Wrong-tool expected cause: structured tool-contract finding only. */
function isToolContractFailureReason(reason) {
  const text = String(reason ?? "");
  if (isInfrastructureFailureReason(text)) return false;
  if (isMissingMetadataReason(text)) return false;
  return /delete_orders|forbidden tool|lookup_orders|tool contract|trajectory fail/i.test(
    text,
  );
}

/** Trajectory classification may accept tool-contract or missing-metadata reasons. */
function isStructuredToolContractReason(reason) {
  return isToolContractFailureReason(reason) || isMissingMetadataReason(reason);
}

/**
 * Trajectory / missing-metadata assertion identity.
 * Requires javascript + known assert file marker, or an explicit tool-contract
 * finding in the reason. Bare javascript / infrastructure failures do not count.
 */
function isTrajectoryComponent(c) {
  const type = assertionType(c);
  const value = assertionValue(c);
  const reason = assertionReason(c);
  if (type === "javascript") {
    if (TRAJECTORY_ASSERT_MARKERS.some((m) => value.includes(m))) {
      return true;
    }
    return isStructuredToolContractReason(reason);
  }
  return /trajectory|tool.?contract|delete_orders|lookup_orders/i.test(
    `${type} ${value} ${reason}`,
  );
}

export function overallPass(row) {
  if (typeof row?.success === "boolean") return row.success;
  if (typeof row?.pass === "boolean") return row.pass;
  if (typeof row?.gradingResult?.pass === "boolean") return row.gradingResult.pass;
  const comps = componentResults(row);
  if (comps.length > 0) return comps.every((c) => c.pass === true);
  return undefined;
}

/**
 * Require exactly one equals answer component with an explicit boolean pass.
 * @returns {{ pass: boolean|undefined, error?: string }}
 */
function requireAnswerEvidence(row, label) {
  const equalsComps = componentResults(row).filter(
    (c) => assertionType(c) === "equals",
  );
  const comps = equalsComps.filter(isAnswerComponent);
  if (comps.length === 0) {
    if (equalsComps.length > 0) {
      return {
        pass: undefined,
        error: `${label}: equals answer assertion target must be exactly "${ANSWER_ASSERT_VALUE}" (unrelated/wrong target rejected)`,
      };
    }
    return {
      pass: undefined,
      error: `${label}: missing equals answer assertion evidence`,
    };
  }
  if (comps.length > 1) {
    return {
      pass: undefined,
      error: `${label}: duplicate equals answer assertions (${comps.length})`,
    };
  }
  const pass = comps[0]?.pass;
  if (pass !== true && pass !== false) {
    return {
      pass: undefined,
      error: `${label}: answer assertion missing explicit boolean pass`,
    };
  }
  return { pass };
}

/**
 * Require exactly one trajectory-classified component with explicit boolean pass.
 * @returns {{ pass: boolean|undefined, reason?: string, error?: string }}
 */
function requireTrajectoryEvidence(row, label) {
  const comps = componentResults(row).filter(isTrajectoryComponent);
  if (comps.length === 0) {
    return {
      pass: undefined,
      error: `${label}: missing trajectory/tool-contract assertion evidence`,
    };
  }
  if (comps.length > 1) {
    return {
      pass: undefined,
      error: `${label}: duplicate trajectory assertions (${comps.length})`,
    };
  }
  const pass = comps[0]?.pass;
  if (pass !== true && pass !== false) {
    return {
      pass: undefined,
      error: `${label}: trajectory assertion missing explicit boolean pass`,
    };
  }
  return {
    pass,
    reason: assertionReason(comps[0]) || assertionValue(comps[0]) || undefined,
  };
}

/**
 * Interpret the required three-case matrix. Order-independent.
 * Rejects missing assertion evidence, infrastructure failure causes, and
 * answer-fail + trajectory-pass (wrong demonstration).
 */
export function interpretMatrix(rows) {
  const failures = [];
  if (!Array.isArray(rows) || rows.length < 3) {
    failures.push(
      `expected >=3 result rows, got ${Array.isArray(rows) ? rows.length : 0}`,
    );
    return { ok: false, failures, summary: null };
  }

  const found = {};
  for (const [key, spec] of Object.entries(CASE_SPECS)) {
    const hit = findCaseRow(rows, spec);
    if (hit.error) {
      failures.push(hit.error);
    } else {
      found[key] = hit.row;
    }
  }
  if (failures.length > 0) {
    return { ok: false, failures, summary: null };
  }

  const knownIds = new Set(Object.values(CASE_SPECS).map((s) => s.caseId));
  const knownDesc = new Set(Object.values(CASE_SPECS).map((s) => s.description));
  for (const row of rows) {
    const id = rowCaseId(row);
    const desc = rowDescription(row);
    if (id && !knownIds.has(id)) {
      failures.push(`unexpected extra caseId "${id}"`);
    } else if (!id && desc && !knownDesc.has(desc) && rows.length > 3) {
      failures.push(`unexpected extra case "${desc}"`);
    }
  }

  const correct = found.correct;
  const wrong = found.wrong;
  const missing = found.missing;

  const correctOverall = overallPass(correct);
  const correctAnswerEv = requireAnswerEvidence(correct, "correct-tool");
  const correctTrajEv = requireTrajectoryEvidence(correct, "correct-tool");
  if (correctAnswerEv.error) failures.push(correctAnswerEv.error);
  if (correctTrajEv.error) failures.push(correctTrajEv.error);

  const wrongAnswerEv = requireAnswerEvidence(wrong, "wrong-tool");
  const wrongTrajEv = requireTrajectoryEvidence(wrong, "wrong-tool");
  if (wrongAnswerEv.error) failures.push(wrongAnswerEv.error);
  if (wrongTrajEv.error) failures.push(wrongTrajEv.error);

  const missingTrajEv = requireTrajectoryEvidence(missing, "missing-metadata");
  if (missingTrajEv.error) failures.push(missingTrajEv.error);

  const correctAnswer = correctAnswerEv.pass;
  const correctTraj = correctTrajEv.pass;
  const wrongAnswer = wrongAnswerEv.pass;
  const wrongTraj = wrongTrajEv.pass;
  const wrongReason = wrongTrajEv.reason;
  const wrongOverall = overallPass(wrong);
  const missingOverall = overallPass(missing);
  const missingTraj = missingTrajEv.pass;

  for (const [label, row] of [
    ["correct", correct],
    ["wrong", wrong],
    ["missing", missing],
  ]) {
    const a = requireAnswerEvidence(row, label);
    const t = requireTrajectoryEvidence(row, label);
    if (a.pass === false && t.pass === true) {
      failures.push(
        `${label}: answer failed while trajectory passed (wrong demonstration; outer must fail)`,
      );
    }
  }

  if (correctOverall !== true) {
    failures.push("correct-tool: expected overall pass");
  }
  if (correctAnswer !== true) {
    failures.push("correct-tool: expected answer assertion to pass (explicit true)");
  }
  if (correctTraj !== true) {
    failures.push(
      "correct-tool: expected trajectory assertion to pass (explicit true)",
    );
  }

  if (wrongAnswer !== true) {
    failures.push("wrong-tool: expected answer assertion to pass (explicit true)");
  }
  if (wrongTraj !== false) {
    failures.push(
      "wrong-tool: expected trajectory assertion to fail (explicit false)",
    );
  }
  if (wrongOverall !== false) {
    failures.push("wrong-tool: expected overall fail (explicit false)");
  }
  if (wrongTraj === false) {
    if (wrongReason === undefined || wrongReason.trim() === "") {
      failures.push("wrong-tool: trajectory fail missing structured reason");
    } else if (isMissingMetadataReason(wrongReason)) {
      failures.push(
        `wrong-tool: trajectory failed for missing-metadata cause (belongs to missing-metadata case): ${wrongReason.slice(0, 200)}`,
      );
    } else if (isInfrastructureFailureReason(wrongReason)) {
      failures.push(
        `wrong-tool: trajectory failed for infrastructure/unrelated reason: ${wrongReason.slice(0, 200)}`,
      );
    } else if (!isToolContractFailureReason(wrongReason)) {
      failures.push(
        `wrong-tool: trajectory failed for generic/unrelated reason: ${wrongReason.slice(0, 200)}`,
      );
    }
  }

  if (missingOverall === true || missingTraj === true) {
    failures.push("missing-metadata: trajectory/evidence must not pass");
  }
  if (missingOverall !== false) {
    failures.push("missing-metadata: expected overall fail (explicit false)");
  }
  if (missingTraj !== false) {
    failures.push(
      "missing-metadata: expected trajectory assertion to fail (explicit false)",
    );
  }
  if (missingTraj === false) {
    const missingReason = missingTrajEv.reason;
    const missingComp = componentResults(missing).find(isTrajectoryComponent);
    const hasMissingMarker =
      missingComp !== undefined &&
      assertionValue(missingComp).includes("assert-missing-metadata.mjs");
    if (missingReason === undefined || missingReason.trim() === "") {
      failures.push("missing-metadata: trajectory fail missing structured reason");
    } else if (isInfrastructureFailureReason(missingReason)) {
      failures.push(
        `missing-metadata: failed for infrastructure/unrelated reason: ${missingReason.slice(0, 200)}`,
      );
    } else if (!isMissingMetadataReason(missingReason) && !hasMissingMarker) {
      failures.push(
        `missing-metadata: failed for swapped/unrelated cause: ${missingReason.slice(0, 200)}`,
      );
    }
  }

  const summary = {
    correct: {
      caseId: CASE_SPECS.correct.caseId,
      overallPass: correctOverall,
      answerPass: correctAnswer,
      trajectoryPass: correctTraj,
    },
    wrong: {
      caseId: CASE_SPECS.wrong.caseId,
      overallPass: wrongOverall,
      answerPass: wrongAnswer,
      trajectoryPass: wrongTraj,
      trajectoryFailReason: wrongReason ?? null,
    },
    missing: {
      caseId: CASE_SPECS.missing.caseId,
      overallPass: missingOverall,
      trajectoryPass: missingTraj,
    },
  };

  return { ok: failures.length === 0, failures, summary };
}

/**
 * Bind child classification to matrix interpretation.
 * Never trusts results when child is an infrastructure error — even if a file exists.
 */
export function evaluatePromptfooInvocation(child, resultsJson) {
  const childClass = classifyChildProcess(child);
  if (childClass.kind === "infra_error") {
    return {
      ok: false,
      failures: [childClass.message],
      summary: null,
      childKind: childClass.kind,
    };
  }
  if (resultsJson === undefined || resultsJson === null) {
    return {
      ok: false,
      failures: [
        "no results JSON for this invocation (refusing stale/shared paths)",
      ],
      summary: null,
      childKind: childClass.kind,
    };
  }
  let parsed;
  try {
    parsed =
      typeof resultsJson === "string" ? JSON.parse(resultsJson) : resultsJson;
  } catch (error) {
    return {
      ok: false,
      failures: [
        `malformed results JSON: ${error instanceof Error ? error.message : String(error)}`,
      ],
      summary: null,
      childKind: childClass.kind,
    };
  }
  const rows = extractRows(parsed);
  const matrix = interpretMatrix(rows);
  return {
    ok: matrix.ok,
    failures: matrix.failures,
    summary: matrix.summary,
    childKind: childClass.kind,
  };
}

/** Exported for tests (exact answer value used by equals asserts). */
export const EXPECTED_ANSWER_VALUE = ANSWER_ASSERT_VALUE;
