/**
 * Executable controls for the Promptfoo matrix interpreter (synthetic).
 * These do not run Promptfoo CLI and must not be labeled as live integration evidence.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  CASE_SPECS,
  EXPECTED_TEST_FAILURE_EXIT,
  classifyChildProcess,
  evaluatePromptfooInvocation,
  interpretMatrix,
} from "./matrix-interpret.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

function traj(pass, reason = "trajectory pass for run_x") {
  return {
    pass,
    assertion: { type: "javascript", value: "file://./assert-trajectory.mjs" },
    reason,
  };
}

function missingMeta(pass, reason = "missing metadata.agentInspectRunName (exact run required)") {
  return {
    pass,
    assertion: {
      type: "javascript",
      value: "file://./assert-missing-metadata.mjs",
    },
    reason,
  };
}

const goodMatrix = [
  row(CASE_SPECS.correct.caseId, CASE_SPECS.correct.description, [equals(true), traj(true)], true),
  row(
    CASE_SPECS.wrong.caseId,
    CASE_SPECS.wrong.description,
    [equals(true), traj(false, "trajectory fail for run_y: forbidden tool delete_orders")],
    false,
  ),
  row(
    CASE_SPECS.missing.caseId,
    CASE_SPECS.missing.description,
    [missingMeta(false)],
    false,
  ),
];

describe("matrix-interpret parity", () => {
  it("keeps recipe and kit copies byte-identical", () => {
    const recipe = readFileSync(path.join(__dirname, "matrix-interpret.mjs"));
    const kit = readFileSync(
      path.join(
        __dirname,
        "../../../reviewer-kits/promptfoo-trajectory/lib/matrix-interpret.mjs",
      ),
    );
    assert.equal(recipe.equals(kit), true);
  });
});

describe("classifyChildProcess", () => {
  it("rejects exit 42 as infrastructure error", () => {
    const c = classifyChildProcess({ status: 42, error: null, signal: null });
    assert.equal(c.kind, "infra_error");
  });

  it("accepts declared test-failure exit 100 for matrix evaluation", () => {
    const c = classifyChildProcess({
      status: EXPECTED_TEST_FAILURE_EXIT,
      error: null,
      signal: null,
    });
    assert.equal(c.kind, "expected_test_failure_exit");
  });

  it("rejects spawn errors and signals", () => {
    assert.equal(
      classifyChildProcess({
        status: null,
        error: new Error("spawn ENOENT"),
        signal: null,
      }).kind,
      "infra_error",
    );
    assert.equal(
      classifyChildProcess({ status: null, error: null, signal: "SIGKILL" }).kind,
      "infra_error",
    );
  });
});

describe("interpretMatrix", () => {
  it("passes the required matrix in any row order", () => {
    const shuffled = [goodMatrix[2], goodMatrix[0], goodMatrix[1]];
    const result = interpretMatrix(shuffled);
    assert.equal(result.ok, true, result.failures.join("; "));
  });

  it("rejects answer-fail + trajectory-pass as wrong demonstration", () => {
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
    const result = interpretMatrix(rows);
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /wrong demonstration/i);
  });

  it("rejects missing and duplicate case identities", () => {
    assert.equal(interpretMatrix(goodMatrix.slice(0, 2)).ok, false);
    const dup = [...goodMatrix, goodMatrix[0]];
    const result = interpretMatrix(dup);
    assert.equal(result.ok, false);
  });

  it("rejects correct case with success true but no component assertions", () => {
    const rows = [
      row(CASE_SPECS.correct.caseId, CASE_SPECS.correct.description, [], true),
      goodMatrix[1],
      goodMatrix[2],
    ];
    const result = interpretMatrix(rows);
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /missing equals answer/i);
  });

  it("rejects wrong case with trajectory fail but no answer assertion", () => {
    const rows = [
      goodMatrix[0],
      row(
        CASE_SPECS.wrong.caseId,
        CASE_SPECS.wrong.description,
        [traj(false, "forbidden tool delete_orders")],
        false,
      ),
      goodMatrix[2],
    ];
    const result = interpretMatrix(rows);
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /missing equals answer/i);
  });

  it("rejects wrong-path when only an unrelated javascript assertion failed", () => {
    const rows = [
      goodMatrix[0],
      row(
        CASE_SPECS.wrong.caseId,
        CASE_SPECS.wrong.description,
        [
          equals(true),
          {
            pass: false,
            assertion: { type: "javascript", value: "process.env.FOO" },
            reason: "required environment variable missing",
          },
        ],
        false,
      ),
      goodMatrix[2],
    ];
    const result = interpretMatrix(rows);
    assert.equal(result.ok, false);
    assert.match(
      result.failures.join(" "),
      /missing trajectory|infrastructure|unrelated/i,
    );
  });

  it("rejects missing-metadata case when failure is SyntaxError infrastructure", () => {
    const rows = [
      goodMatrix[0],
      goodMatrix[1],
      row(
        CASE_SPECS.missing.caseId,
        CASE_SPECS.missing.description,
        [
          {
            pass: false,
            assertion: {
              type: "javascript",
              value: "file://./assert-missing-metadata.mjs",
            },
            reason: "SyntaxError in assertion script",
          },
        ],
        false,
      ),
    ];
    const result = interpretMatrix(rows);
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /infrastructure|SyntaxError/i);
  });

  it("rejects wrong-path when trajectory reason is generic parse error", () => {
    const rows = [
      goodMatrix[0],
      row(
        CASE_SPECS.wrong.caseId,
        CASE_SPECS.wrong.description,
        [
          equals(true),
          traj(false, "parse error"),
        ],
        false,
      ),
      goodMatrix[2],
    ];
    const result = interpretMatrix(rows);
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /generic|unrelated/i);
  });

  it("rejects wrong-tool when equals targets an unrelated answer string", () => {
    const rows = [
      goodMatrix[0],
      row(
        CASE_SPECS.wrong.caseId,
        CASE_SPECS.wrong.description,
        [
          {
            pass: true,
            assertion: { type: "equals", value: "Unrelated expected answer" },
            reason: "equals",
          },
          traj(false, "trajectory fail for run_y: forbidden tool delete_orders"),
        ],
        false,
      ),
      goodMatrix[2],
    ];
    const result = interpretMatrix(rows);
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /unrelated|answer assertion target/i);
  });

  it("rejects wrong-tool when trajectory fails only for missing run metadata", () => {
    const rows = [
      goodMatrix[0],
      row(
        CASE_SPECS.wrong.caseId,
        CASE_SPECS.wrong.description,
        [
          equals(true),
          traj(false, "missing run metadata"),
        ],
        false,
      ),
      goodMatrix[2],
    ];
    const result = interpretMatrix(rows);
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /missing-metadata cause|tool contract/i);
  });
});

describe("evaluatePromptfooInvocation", () => {
  it("never trusts stale JSON after unexpected child exit 42", () => {
    const stale = JSON.stringify({ results: goodMatrix });
    const result = evaluatePromptfooInvocation(
      { status: 42, error: null, signal: null },
      stale,
    );
    assert.equal(result.ok, false);
    assert.equal(result.childKind, "infra_error");
    assert.match(result.failures.join(" "), /42|not trusted|do not reuse/i);
  });

  it("accepts exit 100 only when the fresh matrix matches", () => {
    const pass = evaluatePromptfooInvocation(
      { status: EXPECTED_TEST_FAILURE_EXIT, error: null, signal: null },
      JSON.stringify({ results: goodMatrix }),
    );
    assert.equal(pass.ok, true, pass.failures.join("; "));

    const bad = evaluatePromptfooInvocation(
      { status: EXPECTED_TEST_FAILURE_EXIT, error: null, signal: null },
      JSON.stringify({ results: [] }),
    );
    assert.equal(bad.ok, false);
  });

  it("rejects missing results even on exit 0", () => {
    const result = evaluatePromptfooInvocation(
      { status: 0, error: null, signal: null },
      null,
    );
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /no results JSON/i);
  });

  it("rejects malformed JSON", () => {
    const result = evaluatePromptfooInvocation(
      { status: 0, error: null, signal: null },
      "{not-json",
    );
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /malformed/i);
  });

  it("wrapper entry rejects the four audit false-green matrices on exit 100", () => {
    const child = {
      status: EXPECTED_TEST_FAILURE_EXIT,
      error: null,
      signal: null,
    };
    const controls = [
      [
        "no assertions",
        [
          row(CASE_SPECS.correct.caseId, CASE_SPECS.correct.description, [], true),
          goodMatrix[1],
          goodMatrix[2],
        ],
      ],
      [
        "wrong missing answer",
        [
          goodMatrix[0],
          row(
            CASE_SPECS.wrong.caseId,
            CASE_SPECS.wrong.description,
            [traj(false, "forbidden tool delete_orders")],
            false,
          ),
          goodMatrix[2],
        ],
      ],
      [
        "env missing",
        [
          goodMatrix[0],
          row(
            CASE_SPECS.wrong.caseId,
            CASE_SPECS.wrong.description,
            [
              equals(true),
              {
                pass: false,
                assertion: { type: "javascript", value: "env" },
                reason: "required environment variable missing",
              },
            ],
            false,
          ),
          goodMatrix[2],
        ],
      ],
      [
        "syntax error",
        [
          goodMatrix[0],
          goodMatrix[1],
          row(
            CASE_SPECS.missing.caseId,
            CASE_SPECS.missing.description,
            [
              {
                pass: false,
                assertion: {
                  type: "javascript",
                  value: "file://./assert-missing-metadata.mjs",
                },
                reason: "SyntaxError in assertion script",
              },
            ],
            false,
          ),
        ],
      ],
    ];
    for (const [label, rows] of controls) {
      const result = evaluatePromptfooInvocation(
        child,
        JSON.stringify({ results: rows }),
      );
      assert.equal(result.ok, false, label);
    }
  });
});
