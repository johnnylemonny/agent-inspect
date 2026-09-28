/**
 * Shared Promptfoo matrix interpreter for recipe + standalone reviewer kit.
 * Keep both copies byte-identical (see matrix-interpret.parity.test.mjs).
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

function isAnswerComponent(c) {
  const type = String(c?.assertion?.type ?? c?.type ?? "");
  const reason = String(c?.reason ?? "");
  return type === "equals" || /equals|answer/i.test(type) || /equals|answer/i.test(reason);
}

function isTrajectoryComponent(c) {
  const type = String(c?.assertion?.type ?? c?.type ?? "");
  const value = String(c?.assertion?.value ?? c?.value ?? "");
  const reason = String(c?.reason ?? "");
  return (
    type === "javascript" ||
    /trajectory|tool|contract|lookup_orders|delete_orders|missing/i.test(
      `${type} ${value} ${reason}`,
    )
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

function answerPass(row) {
  const comps = componentResults(row).filter(isAnswerComponent);
  if (comps.length > 0) return comps.every((c) => c.pass === true);
  const output = row?.response?.output ?? row?.output;
  if (typeof output === "string" && output === "You have 2 orders") return true;
  return undefined;
}

function trajectoryPass(row) {
  const comps = componentResults(row).filter(isTrajectoryComponent);
  if (comps.length > 0) return comps.every((c) => c.pass === true);
  // Missing-metadata case often has only the trajectory/js assert.
  if (componentResults(row).length === 1) {
    return componentResults(row)[0]?.pass === true;
  }
  return undefined;
}

function trajectoryFailReason(row) {
  const failed = componentResults(row).filter(
    (c) => c.pass === false && isTrajectoryComponent(c),
  );
  if (failed.length === 0) return undefined;
  return String(failed[0]?.reason ?? failed[0]?.assertion?.value ?? "trajectory-failed");
}

/**
 * Interpret the required three-case matrix. Order-independent.
 * Rejects answer-fail + trajectory-pass (wrong demonstration).
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

  // Extra cases with stable ids not in the matrix are errors.
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
  const correctAnswer = answerPass(correct);
  const correctTraj = trajectoryPass(correct);

  const wrongAnswer = answerPass(wrong);
  const wrongTraj = trajectoryPass(wrong);
  const wrongOverall = overallPass(wrong);
  const wrongReason = trajectoryFailReason(wrong);

  const missingOverall = overallPass(missing);
  const missingTraj = trajectoryPass(missing);

  // Wrong demonstration: answer fails while trajectory passes.
  for (const [label, row] of [
    ["correct", correct],
    ["wrong", wrong],
    ["missing", missing],
  ]) {
    const a = answerPass(row);
    const t = trajectoryPass(row);
    if (a === false && t === true) {
      failures.push(
        `${label}: answer failed while trajectory passed (wrong demonstration; outer must fail)`,
      );
    }
  }

  if (correctOverall !== true) {
    failures.push("correct-tool: expected overall pass");
  }
  if (correctAnswer === false) {
    failures.push("correct-tool: expected answer assertion to pass");
  }
  if (correctTraj === false) {
    failures.push("correct-tool: expected trajectory assertion to pass");
  }

  if (wrongAnswer === false) {
    failures.push("wrong-tool: expected answer assertion to pass");
  }
  if (wrongTraj !== false) {
    failures.push("wrong-tool: expected trajectory assertion to fail");
  }
  if (wrongOverall === true) {
    failures.push("wrong-tool: expected overall fail");
  }
  if (wrongTraj === false && wrongReason !== undefined) {
    const okReason =
      /tool|forbidden|delete_orders|required|contract|trajectory/i.test(wrongReason);
    if (!okReason) {
      failures.push(
        `wrong-tool: trajectory failed for generic/unrelated reason: ${wrongReason.slice(0, 200)}`,
      );
    }
  }

  if (missingOverall === true || missingTraj === true) {
    failures.push("missing-metadata: trajectory/evidence must not pass");
  }
  if (missingOverall !== false && missingTraj !== false) {
    failures.push("missing-metadata: expected an explicit fail");
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
