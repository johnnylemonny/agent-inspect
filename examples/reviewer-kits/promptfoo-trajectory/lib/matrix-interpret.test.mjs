/**
 * Kit-local matrix controls (synthetic). Parity is enforced from the recipe copy.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CASE_SPECS,
  EXPECTED_TEST_FAILURE_EXIT,
  classifyChildProcess,
  evaluatePromptfooInvocation,
  interpretMatrix,
} from "./matrix-interpret.mjs";

function row(caseId, description, components, overall) {
  return {
    description,
    vars: { caseId },
    success: overall,
    gradingResult: {
      pass: overall,
      componentResults: components,
    },
  };
}

function equals(pass) {
  return {
    pass,
    assertion: { type: "equals", value: "You have 2 orders" },
    reason: pass ? "equals" : "answer mismatch",
  };
}

function traj(pass, reason = "trajectory") {
  return {
    pass,
    assertion: { type: "javascript", value: "file://./assert-trajectory.mjs" },
    reason,
  };
}

const goodMatrix = [
  row(CASE_SPECS.correct.caseId, CASE_SPECS.correct.description, [equals(true), traj(true)], true),
  row(
    CASE_SPECS.wrong.caseId,
    CASE_SPECS.wrong.description,
    [equals(true), traj(false, "forbidden tool delete_orders")],
    false,
  ),
  row(
    CASE_SPECS.missing.caseId,
    CASE_SPECS.missing.description,
    [traj(false, "missing run metadata")],
    false,
  ),
];

describe("reviewer-kit matrix-interpret", () => {
  it("rejects stale JSON after exit 42", () => {
    const result = evaluatePromptfooInvocation(
      { status: 42, error: null, signal: null },
      JSON.stringify({ results: goodMatrix }),
    );
    assert.equal(result.ok, false);
    assert.equal(result.childKind, "infra_error");
  });

  it("accepts shuffled matrix on declared test-failure exit", () => {
    const shuffled = [goodMatrix[1], goodMatrix[2], goodMatrix[0]];
    const result = evaluatePromptfooInvocation(
      { status: EXPECTED_TEST_FAILURE_EXIT, error: null, signal: null },
      JSON.stringify({ results: shuffled }),
    );
    assert.equal(result.ok, true, result.failures.join("; "));
  });

  it("rejects answer-fail trajectory-pass", () => {
    const rows = [
      row(
        CASE_SPECS.correct.caseId,
        CASE_SPECS.correct.description,
        [equals(false), traj(true)],
        false,
      ),
      goodMatrix[1],
      goodMatrix[2],
    ];
    assert.equal(interpretMatrix(rows).ok, false);
  });

  it("classifies exit 100 vs other nonzero", () => {
    assert.equal(
      classifyChildProcess({
        status: EXPECTED_TEST_FAILURE_EXIT,
        error: null,
        signal: null,
      }).kind,
      "expected_test_failure_exit",
    );
    assert.equal(
      classifyChildProcess({ status: 1, error: null, signal: null }).kind,
      "infra_error",
    );
  });
});
