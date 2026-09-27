import path from "node:path";

import {
  createLlmUsageRule,
  createObservedOutcomeRule,
  createRunDepthRule,
  createRunDurationRule,
  createRunStatusRule,
  createToolFailureRule,
  createToolUsageRule,
  runTraceChecks,
  type TraceCheckRule,
} from "../checks/index.js";
import { extractOutcomesFromPersistedEvents, extractOutcomesFromTraceEvents } from "../outcomes/extract.js";
import { openTrace, type TraceReadResult } from "../readers/index.js";
import type { TraceEvent } from "../types.js";
import { loadSuiteConfig } from "./load.js";
import { resolveSuiteCaseTrace } from "./resolve.js";
import type {
  RunSuiteOptions,
  SuiteCaseConfig,
  SuiteCaseResult,
  SuiteCaseStatus,
  SuiteConfig,
  SuiteDiagnostic,
  SuiteRunResult,
} from "./types.js";

/** Selectors the suite compiler can materialize into check rules. */
const KNOWN_SUITE_SELECT_IDS = new Set([
  "run.status",
  "run.duration",
  "run.depth",
  "outcome.status",
  "tool.usage",
  "tool.failures",
  "llm.usage",
]);

function diagnostic(
  code: SuiteDiagnostic["code"],
  message: string,
  severity: SuiteDiagnostic["severity"] = "error",
  caseId?: string,
): SuiteDiagnostic {
  return { code, message, severity, ...(caseId !== undefined ? { caseId } : {}) };
}

interface CompiledCaseAssertions {
  rules: TraceCheckRule[];
  select: string[];
  observationCount: number;
  configDiagnostics: SuiteDiagnostic[];
}

function buildCaseAssertions(
  suiteCase: SuiteCaseConfig,
  config: SuiteConfig,
): CompiledCaseAssertions {
  const rules: TraceCheckRule[] = [];
  const select = new Set<string>(config.checks?.select ?? []);
  const configDiagnostics: SuiteDiagnostic[] = [];
  const evalConfig = config.eval;

  const declaredSelect = [...select];
  for (const id of declaredSelect) {
    if (!KNOWN_SUITE_SELECT_IDS.has(id)) {
      configDiagnostics.push(
        diagnostic(
          "AI_SUITE_UNKNOWN_SELECTOR",
          `Unknown or unsupported suite check selector "${id}".`,
          "error",
          suiteCase.id,
        ),
      );
    }
  }

  if (select.has("run.status") || evalConfig?.requireSuccess === true) {
    rules.push(createRunStatusRule());
    select.add("run.status");
  }

  const requiredTools = [
    ...(config.checks?.tool?.required ?? []),
    ...(evalConfig?.requiredTools ?? []),
    ...(suiteCase.requireTools ?? []),
  ];
  const forbiddenTools = [
    ...(config.checks?.tool?.forbidden ?? []),
    ...(evalConfig?.forbiddenTools ?? []),
    ...(suiteCase.forbidTools ?? []),
  ];
  if (requiredTools.length > 0 || forbiddenTools.length > 0) {
    rules.push(
      createToolUsageRule({
        required: requiredTools.length > 0 ? requiredTools : undefined,
        forbidden: forbiddenTools.length > 0 ? forbiddenTools : undefined,
      }),
    );
    select.add("tool.usage");
  }

  const maxDurationMs =
    suiteCase.maxDurationMs ??
    config.checks?.run?.maxDurationMs ??
    evalConfig?.maxDurationMs;
  if (maxDurationMs !== undefined) {
    rules.push(createRunDurationRule({ maxDurationMs }));
    select.add("run.duration");
  }

  const maxDepth = config.checks?.run?.maxDepth ?? evalConfig?.maxDepth;
  if (maxDepth !== undefined) {
    rules.push(createRunDepthRule({ maxDepth }));
    select.add("run.depth");
  }

  if (evalConfig?.maxRetries !== undefined) {
    rules.push(createToolFailureRule({ maxRetries: evalConfig.maxRetries }));
    select.add("tool.failures");
  }

  const allowedModels = config.checks?.llm?.allowedModels;
  const maxTotalTokens =
    config.checks?.llm?.maxTotalTokens ?? evalConfig?.maxTotalTokens;
  if (allowedModels !== undefined || maxTotalTokens !== undefined) {
    rules.push(
      createLlmUsageRule({
        ...(allowedModels !== undefined ? { allowedModels } : {}),
        ...(maxTotalTokens !== undefined ? { maxTotalTokens } : {}),
      }),
    );
    select.add("llm.usage");
  }

  if (select.has("outcome.status")) {
    rules.push(createObservedOutcomeRule({ failOn: ["failed"] }));
  }

  const observationCount = suiteCase.expectedObservations?.length ?? 0;

  if (
    rules.length === 0 &&
    observationCount === 0 &&
    configDiagnostics.length === 0
  ) {
    configDiagnostics.push(
      diagnostic(
        "AI_SUITE_NO_ASSERTIONS",
        `Suite case "${suiteCase.id}" declares no effective checks, eval controls, or expected observations.`,
        "error",
        suiteCase.id,
      ),
    );
  }

  return {
    rules,
    select: [...select],
    observationCount,
    configDiagnostics,
  };
}

function outcomesFromRead(read: TraceReadResult) {
  const persistedOutcomes = extractOutcomesFromPersistedEvents(
    read.events.filter((event) => event.kind === "OUTCOME"),
  );
  if (persistedOutcomes.length > 0) return persistedOutcomes;

  const traceEvents: TraceEvent[] = [];
  for (const event of read.events) {
    const legacy = event as unknown as TraceEvent;
    if (
      typeof legacy === "object" &&
      legacy !== null &&
      "event" in legacy &&
      legacy.event === "outcome_observed"
    ) {
      traceEvents.push(legacy);
    }
  }
  return traceEvents.length > 0 ? extractOutcomesFromTraceEvents(traceEvents) : [];
}

function validateExpectedObservations(
  suiteCase: SuiteCaseConfig,
  read: TraceReadResult,
): { ok: boolean; diagnostics: SuiteDiagnostic[] } {
  const expected = suiteCase.expectedObservations ?? [];
  if (expected.length === 0) return { ok: true, diagnostics: [] };

  const outcomes = outcomesFromRead(read);

  const diagnostics: SuiteDiagnostic[] = [];
  for (const name of expected) {
    const match = outcomes.find((outcome) => outcome.name === name);
    if (!match) {
      diagnostics.push(
        diagnostic(
          "AI_SUITE_CASE_OBSERVATION_FAILED",
          `Expected observation "${name}" was not recorded.`,
          "error",
          suiteCase.id,
        ),
      );
      continue;
    }
    if (match.status !== "passed") {
      diagnostics.push(
        diagnostic(
          "AI_SUITE_CASE_OBSERVATION_FAILED",
          `Observation "${name}" has status "${match.status}", expected "passed".`,
          "error",
          suiteCase.id,
        ),
      );
    }
  }

  return { ok: diagnostics.length === 0, diagnostics };
}

function evaluateCaseExpect(
  suiteCase: SuiteCaseConfig,
  checkResult: {
    ok: boolean;
    status: "pass" | "fail" | "error";
    findings: readonly { ruleId: string; status: string; severity: string }[];
    diagnostics: readonly { severity: string }[];
    ruleExecutions: readonly unknown[];
  },
  observationCount: number,
): { ok: boolean; diagnostics: SuiteDiagnostic[] } {
  const expectation = suiteCase.expect;
  if (expectation === undefined) {
    return { ok: true, diagnostics: [] };
  }

  const diagnostics: SuiteDiagnostic[] = [];
  if (checkResult.status !== expectation.checkStatus) {
    diagnostics.push(
      diagnostic(
        "AI_SUITE_EXPECT_MISMATCH",
        `Expected check status "${expectation.checkStatus}", got "${checkResult.status}".`,
        "error",
        suiteCase.id,
      ),
    );
  }

  const failedFindings = checkResult.findings.filter(
    (finding) => finding.status === "fail" && finding.severity === "error",
  );
  const requiredIds = expectation.findingRuleIds ?? [];
  for (const ruleId of requiredIds) {
    if (!failedFindings.some((finding) => finding.ruleId === ruleId)) {
      diagnostics.push(
        diagnostic(
          "AI_SUITE_EXPECT_MISMATCH",
          `Expected failing finding for rule "${ruleId}" was not present.`,
          "error",
          suiteCase.id,
        ),
      );
    }
  }

  const rejectUnexpected = expectation.rejectUnexpectedFindings !== false;
  if (rejectUnexpected && requiredIds.length > 0) {
    for (const finding of failedFindings) {
      if (!requiredIds.includes(finding.ruleId)) {
        diagnostics.push(
          diagnostic(
            "AI_SUITE_EXPECT_MISMATCH",
            `Unexpected failing finding for rule "${finding.ruleId}".`,
            "error",
            suiteCase.id,
          ),
        );
      }
    }
  }

  if (expectation.minAssertions !== undefined) {
    const assertionCount = checkResult.ruleExecutions.length + observationCount;
    if (assertionCount < expectation.minAssertions) {
      diagnostics.push(
        diagnostic(
          "AI_SUITE_EXPECT_MISMATCH",
          `Expected at least ${expectation.minAssertions} assertion(s), got ${assertionCount}.`,
          "error",
          suiteCase.id,
        ),
      );
    }
  }

  // Evaluator / config errors never satisfy a semantic-failure expectation.
  if (
    expectation.checkStatus === "fail" &&
    checkResult.diagnostics.some((item) => item.severity === "error") &&
    checkResult.status === "error"
  ) {
    diagnostics.push(
      diagnostic(
        "AI_SUITE_EXPECT_MISMATCH",
        "Check ended in evaluator/config error; semantic failure expectation requires status \"fail\".",
        "error",
        suiteCase.id,
      ),
    );
  }

  return { ok: diagnostics.length === 0, diagnostics };
}

async function runSuiteCase(
  suiteCase: SuiteCaseConfig,
  config: SuiteConfig,
  options: { configDir: string; tracesDir: string },
): Promise<SuiteCaseResult> {
  const resolved = await resolveSuiteCaseTrace(suiteCase, options);
  if (resolved.missing || resolved.tracePath === undefined) {
    return {
      id: suiteCase.id,
      status: "skipped",
      ...(resolved.runId !== undefined ? { runId: resolved.runId } : {}),
      message: resolved.reason,
      diagnostics: [
        diagnostic(
          "AI_SUITE_CASE_TRACE_MISSING",
          resolved.reason ?? "Trace not found.",
          "warning",
          suiteCase.id,
        ),
      ],
    };
  }

  let read: TraceReadResult;
  try {
    read = await openTrace({ type: "file", path: resolved.tracePath });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: suiteCase.id,
      status: "error",
      tracePath: resolved.tracePath,
      ...(resolved.runId !== undefined ? { runId: resolved.runId } : {}),
      message,
      diagnostics: [
        diagnostic("AI_SUITE_TRACE_UNREADABLE", message, "error", suiteCase.id),
      ],
    };
  }

  const compiled = buildCaseAssertions(suiteCase, config);
  if (compiled.configDiagnostics.length > 0) {
    return {
      id: suiteCase.id,
      status: "error",
      tracePath: resolved.tracePath,
      ...(resolved.runId !== undefined ? { runId: resolved.runId } : {}),
      checkOk: false,
      ...(config.eval?.requireSuccess === true ? { evalOk: false } : {}),
      message: compiled.configDiagnostics.map((item) => item.message).join("; "),
      diagnostics: compiled.configDiagnostics,
    };
  }

  const checkResult =
    compiled.rules.length > 0
      ? runTraceChecks({ read }, { rules: compiled.rules, select: compiled.select })
      : {
          ok: true,
          status: "pass" as const,
          format: read.format,
          summary: {
            passed: 0,
            failed: 0,
            warnings: 0,
            errors: 0,
            rulesEvaluated: 0,
            rulesPassed: 0,
            rulesWarning: 0,
            rulesFailed: 0,
            rulesError: 0,
          },
          findings: [],
          diagnostics: [],
          ruleExecutions: [],
        };
  const observationResult = validateExpectedObservations(suiteCase, read);

  const checkOk = checkResult.ok;
  const observationsOk = observationResult.ok;
  const evalOk =
    config.eval?.requireSuccess === true
      ? checkResult.findings.every(
          (finding) => finding.ruleId !== "run.status" || finding.status !== "fail",
        ) &&
        checkResult.diagnostics.every((item) => item.severity !== "error")
      : undefined;

  const expectResult = evaluateCaseExpect(
    suiteCase,
    checkResult,
    compiled.observationCount,
  );
  const checkFailureDiagnostics = [
    ...checkResult.diagnostics.map((item) =>
      diagnostic(
        "AI_SUITE_CASE_CHECK_FAILED",
        item.message,
        item.severity,
        suiteCase.id,
      ),
    ),
    ...checkResult.findings
      .filter((finding) => finding.status === "fail")
      .map((finding) =>
        diagnostic(
          "AI_SUITE_CASE_CHECK_FAILED",
          finding.message,
          finding.severity,
          suiteCase.id,
        ),
      ),
  ];
  const expectMatched =
    suiteCase.expect !== undefined && expectResult.ok && observationsOk;
  const diagnostics = expectMatched
    ? [
        ...observationResult.diagnostics,
        ...expectResult.diagnostics,
        diagnostic(
          "AI_SUITE_CASE_CHECK_FAILED",
          `Expected semantic failure matched (check.status=${checkResult.status}).`,
          "info",
          suiteCase.id,
        ),
      ]
    : [
        ...checkFailureDiagnostics,
        ...observationResult.diagnostics,
        ...expectResult.diagnostics,
      ];

  // When an expect block is present, suite pass/fail follows the expectation
  // (semantic negatives keep raw checkOk false while the case can pass).
  const ok =
    suiteCase.expect !== undefined
      ? expectResult.ok && observationsOk
      : checkOk && observationsOk;
  const status: SuiteCaseStatus = ok
    ? "pass"
    : checkResult.status === "error"
      ? "error"
      : "fail";

  return {
    id: suiteCase.id,
    status,
    tracePath: resolved.tracePath,
    ...(resolved.runId !== undefined ? { runId: resolved.runId } : {}),
    checkOk,
    ...(evalOk !== undefined ? { evalOk } : {}),
    observationsOk,
    diagnostics,
    ...(ok
      ? {}
      : {
          message:
            diagnostics.map((item) => item.message).join("; ") ||
            checkResult.findings.map((item) => item.message).join("; "),
        }),
  };
}

export async function runSuite(options: RunSuiteOptions = {}): Promise<SuiteRunResult> {
  const startedAt = new Date(options.nowMs ?? Date.now()).toISOString();
  const { config, configPath, configDir } = await loadSuiteConfig(options);
  const tracesDir = path.resolve(configDir, config.traces);

  const cases: SuiteCaseResult[] = [];
  const diagnostics: SuiteDiagnostic[] = [];

  for (const suiteCase of config.cases) {
    cases.push(
      await runSuiteCase(suiteCase, config, {
        configDir,
        tracesDir,
      }),
    );
  }

  const summary = {
    passed: cases.filter((item) => item.status === "pass").length,
    failed: cases.filter((item) => item.status === "fail").length,
    errors: cases.filter((item) => item.status === "error").length,
    skipped: cases.filter((item) => item.status === "skipped").length,
  };

  const finishedAt = new Date(options.nowMs ?? Date.now()).toISOString();
  const allSkipped = cases.length > 0 && summary.skipped === cases.length;
  const ok = summary.failed === 0 && summary.errors === 0 && !allSkipped;
  const status =
    summary.errors > 0
      ? "error"
      : allSkipped
        ? "fail"
        : summary.failed > 0 || !ok
          ? "fail"
          : "pass";

  return {
    ok,
    status,
    suiteName: config.name,
    configPath,
    tracesDir,
    startedAt,
    finishedAt,
    summary,
    cases,
    diagnostics,
  };
}
