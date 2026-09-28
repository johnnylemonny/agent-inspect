import { access } from "node:fs/promises";
import path from "node:path";

import type {
  SuiteCaseConfig,
  SuiteCaseExpect,
  SuiteChecksConfig,
  SuiteConfig,
  SuiteDiagnostic,
  SuiteEvalConfig,
  ValidateSuiteConfigResult,
} from "./types.js";

function diagnostic(
  code: SuiteDiagnostic["code"],
  message: string,
  severity: SuiteDiagnostic["severity"] = "error",
  caseId?: string,
): SuiteDiagnostic {
  return { code, message, severity, ...(caseId !== undefined ? { caseId } : {}) };
}

function asString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function asStringArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be an array of strings.`);
  }
  return value;
}

function asPositiveNumber(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number.`);
  }
  return value;
}

function asBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean (not a string or other type).`);
  }
  return value;
}

function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertKnownKeys(
  raw: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(raw)) {
    if (!allowedSet.has(key)) {
      throw new Error(`${label} has unknown key "${key}".`);
    }
  }
}

const CASE_KEYS = [
  "id",
  "trace",
  "runId",
  "input",
  "requireTools",
  "forbidTools",
  "maxDurationMs",
  "expectedObservations",
  "expect",
] as const;

const EXPECT_KEYS = [
  "checkStatus",
  "findingRuleIds",
  "rejectUnexpectedFindings",
  "minAssertions",
] as const;

const CHECKS_KEYS = ["select", "run", "tool", "llm"] as const;
const CHECKS_RUN_KEYS = ["maxDurationMs", "maxDepth"] as const;
const CHECKS_TOOL_KEYS = ["required", "forbidden"] as const;
const CHECKS_LLM_KEYS = ["allowedModels", "maxTotalTokens"] as const;

const EVAL_KEYS = [
  "requireSuccess",
  "requiredTools",
  "forbiddenTools",
  "maxDurationMs",
  "maxDepth",
  "maxRetries",
  "maxTotalTokens",
] as const;

const ROOT_KEYS = [
  "name",
  "traces",
  "cases",
  "checks",
  "eval",
  "redactionProfile",
  "artifacts",
  "baseline",
  "candidate",
] as const;

function asExpectConfig(
  value: unknown,
  label: string,
): SuiteCaseExpect | undefined {
  if (value === undefined) return undefined;
  const raw = assertObject(value, label);
  assertKnownKeys(raw, EXPECT_KEYS, label);
  const checkStatus = raw.checkStatus;
  if (
    checkStatus !== "pass" &&
    checkStatus !== "fail" &&
    checkStatus !== "error"
  ) {
    throw new Error(`${label}.checkStatus must be "pass", "fail", or "error".`);
  }
  const findingRuleIds = asStringArray(raw.findingRuleIds, `${label}.findingRuleIds`);
  const minAssertions = asPositiveNumber(raw.minAssertions, `${label}.minAssertions`);
  const rejectUnexpectedFindings = asBoolean(
    raw.rejectUnexpectedFindings,
    `${label}.rejectUnexpectedFindings`,
  );
  return {
    checkStatus,
    ...(findingRuleIds !== undefined ? { findingRuleIds } : {}),
    ...(rejectUnexpectedFindings !== undefined ? { rejectUnexpectedFindings } : {}),
    ...(minAssertions !== undefined ? { minAssertions } : {}),
  };
}

function asChecksConfig(value: unknown, label: string): SuiteChecksConfig {
  const raw = assertObject(value, label);
  assertKnownKeys(raw, CHECKS_KEYS, label);
  const checks: SuiteChecksConfig = {};
  const select = asStringArray(raw.select, `${label}.select`);
  if (select !== undefined) checks.select = select;

  if (raw.run !== undefined) {
    const run = assertObject(raw.run, `${label}.run`);
    assertKnownKeys(run, CHECKS_RUN_KEYS, `${label}.run`);
    checks.run = {
      ...(asPositiveNumber(run.maxDurationMs, `${label}.run.maxDurationMs`) !== undefined
        ? { maxDurationMs: asPositiveNumber(run.maxDurationMs, `${label}.run.maxDurationMs`) }
        : {}),
      ...(asPositiveNumber(run.maxDepth, `${label}.run.maxDepth`) !== undefined
        ? { maxDepth: asPositiveNumber(run.maxDepth, `${label}.run.maxDepth`) }
        : {}),
    };
  }

  if (raw.tool !== undefined) {
    const tool = assertObject(raw.tool, `${label}.tool`);
    assertKnownKeys(tool, CHECKS_TOOL_KEYS, `${label}.tool`);
    checks.tool = {
      ...(asStringArray(tool.required, `${label}.tool.required`) !== undefined
        ? { required: asStringArray(tool.required, `${label}.tool.required`) }
        : {}),
      ...(asStringArray(tool.forbidden, `${label}.tool.forbidden`) !== undefined
        ? { forbidden: asStringArray(tool.forbidden, `${label}.tool.forbidden`) }
        : {}),
    };
  }

  if (raw.llm !== undefined) {
    const llm = assertObject(raw.llm, `${label}.llm`);
    assertKnownKeys(llm, CHECKS_LLM_KEYS, `${label}.llm`);
    checks.llm = {
      ...(asStringArray(llm.allowedModels, `${label}.llm.allowedModels`) !== undefined
        ? { allowedModels: asStringArray(llm.allowedModels, `${label}.llm.allowedModels`) }
        : {}),
      ...(asPositiveNumber(llm.maxTotalTokens, `${label}.llm.maxTotalTokens`) !== undefined
        ? {
            maxTotalTokens: asPositiveNumber(
              llm.maxTotalTokens,
              `${label}.llm.maxTotalTokens`,
            ),
          }
        : {}),
    };
  }

  return checks;
}

function asEvalConfig(value: unknown, label: string): SuiteEvalConfig {
  const raw = assertObject(value, label);
  assertKnownKeys(raw, EVAL_KEYS, label);
  return {
    ...(asBoolean(raw.requireSuccess, `${label}.requireSuccess`) !== undefined
      ? { requireSuccess: asBoolean(raw.requireSuccess, `${label}.requireSuccess`) }
      : {}),
    ...(asStringArray(raw.requiredTools, `${label}.requiredTools`) !== undefined
      ? { requiredTools: asStringArray(raw.requiredTools, `${label}.requiredTools`) }
      : {}),
    ...(asStringArray(raw.forbiddenTools, `${label}.forbiddenTools`) !== undefined
      ? { forbiddenTools: asStringArray(raw.forbiddenTools, `${label}.forbiddenTools`) }
      : {}),
    ...(asPositiveNumber(raw.maxDurationMs, `${label}.maxDurationMs`) !== undefined
      ? { maxDurationMs: asPositiveNumber(raw.maxDurationMs, `${label}.maxDurationMs`) }
      : {}),
    ...(asPositiveNumber(raw.maxDepth, `${label}.maxDepth`) !== undefined
      ? { maxDepth: asPositiveNumber(raw.maxDepth, `${label}.maxDepth`) }
      : {}),
    ...(asPositiveNumber(raw.maxRetries, `${label}.maxRetries`) !== undefined
      ? { maxRetries: asPositiveNumber(raw.maxRetries, `${label}.maxRetries`) }
      : {}),
    ...(asPositiveNumber(raw.maxTotalTokens, `${label}.maxTotalTokens`) !== undefined
      ? { maxTotalTokens: asPositiveNumber(raw.maxTotalTokens, `${label}.maxTotalTokens`) }
      : {}),
  };
}

function validateCaseConfig(
  value: unknown,
  index: number,
): { caseConfig?: SuiteCaseConfig; diagnostics: SuiteDiagnostic[] } {
  const diagnostics: SuiteDiagnostic[] = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    diagnostics.push(
      diagnostic("AI_SUITE_CONFIG_INVALID", `cases[${index}] must be an object.`),
    );
    return { diagnostics };
  }

  const raw = value as Record<string, unknown>;
  try {
    assertKnownKeys(raw, CASE_KEYS, `cases[${index}]`);
    const id = asString(raw.id, `cases[${index}].id`);
    if (id === undefined) {
      diagnostics.push(
        diagnostic("AI_SUITE_CONFIG_INVALID", `cases[${index}].id is required.`),
      );
      return { diagnostics };
    }

    const trace = asString(raw.trace, `cases[${index}].trace`);
    const runId = asString(raw.runId, `cases[${index}].runId`);
    const input = asString(raw.input, `cases[${index}].input`);

    return {
      caseConfig: {
        id,
        ...(trace !== undefined ? { trace } : {}),
        ...(runId !== undefined ? { runId } : {}),
        ...(input !== undefined ? { input } : {}),
        ...(asStringArray(raw.requireTools, `cases[${index}].requireTools`) !== undefined
          ? { requireTools: asStringArray(raw.requireTools, `cases[${index}].requireTools`) }
          : {}),
        ...(asStringArray(raw.forbidTools, `cases[${index}].forbidTools`) !== undefined
          ? { forbidTools: asStringArray(raw.forbidTools, `cases[${index}].forbidTools`) }
          : {}),
        ...(asPositiveNumber(raw.maxDurationMs, `cases[${index}].maxDurationMs`) !== undefined
          ? {
              maxDurationMs: asPositiveNumber(
                raw.maxDurationMs,
                `cases[${index}].maxDurationMs`,
              ),
            }
          : {}),
        ...(asStringArray(
          raw.expectedObservations,
          `cases[${index}].expectedObservations`,
        ) !== undefined
          ? {
              expectedObservations: asStringArray(
                raw.expectedObservations,
                `cases[${index}].expectedObservations`,
              ),
            }
          : {}),
        ...(asExpectConfig(raw.expect, `cases[${index}].expect`) !== undefined
          ? { expect: asExpectConfig(raw.expect, `cases[${index}].expect`) }
          : {}),
      },
      diagnostics,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    diagnostics.push(diagnostic("AI_SUITE_CONFIG_INVALID", message));
    return { diagnostics };
  }
}

export function normalizeSuiteConfig(value: unknown): SuiteConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Suite config must export an object.");
  }
  const raw = value as Record<string, unknown>;
  assertKnownKeys(raw, ROOT_KEYS, "suite config");
  const name = asString(raw.name, "name");
  const traces = asString(raw.traces, "traces");
  if (name === undefined) throw new Error("name is required.");
  if (traces === undefined) throw new Error("traces is required.");

  if (!Array.isArray(raw.cases) || raw.cases.length === 0) {
    throw new Error("cases must be a non-empty array.");
  }

  const cases: SuiteCaseConfig[] = [];
  for (let index = 0; index < raw.cases.length; index += 1) {
    const { caseConfig, diagnostics } = validateCaseConfig(raw.cases[index], index);
    if (diagnostics.length > 0) {
      throw new Error(diagnostics.map((item) => item.message).join("; "));
    }
    if (caseConfig !== undefined) cases.push(caseConfig);
  }

  const ids = new Set<string>();
  for (const suiteCase of cases) {
    if (ids.has(suiteCase.id)) {
      throw new Error(`Duplicate case id "${suiteCase.id}".`);
    }
    ids.add(suiteCase.id);
  }

  const redactionProfile =
    raw.redactionProfile === "local" ||
    raw.redactionProfile === "share" ||
    raw.redactionProfile === "strict"
      ? raw.redactionProfile
      : undefined;
  if (
    raw.redactionProfile !== undefined &&
    redactionProfile === undefined
  ) {
    throw new Error('redactionProfile must be "local", "share", or "strict".');
  }

  const config: SuiteConfig = { name, traces, cases };
  if (raw.checks !== undefined) {
    config.checks = asChecksConfig(raw.checks, "checks");
  }
  if (raw.eval !== undefined) {
    config.eval = asEvalConfig(raw.eval, "eval");
  }
  if (raw.artifacts !== undefined) {
    const artifacts = assertObject(raw.artifacts, "artifacts");
    assertKnownKeys(artifacts, ["outputDir"], "artifacts");
    const outputDir = asString(artifacts.outputDir, "artifacts.outputDir");
    config.artifacts = outputDir !== undefined ? { outputDir } : {};
  }
  if (raw.baseline !== undefined) {
    const baseline = asString(raw.baseline, "baseline");
    if (baseline !== undefined) config.baseline = baseline;
  }
  if (raw.candidate !== undefined) {
    const candidate = asString(raw.candidate, "candidate");
    if (candidate !== undefined) config.candidate = candidate;
  }
  if (redactionProfile !== undefined) config.redactionProfile = redactionProfile;
  return config;
}

export async function validateSuiteConfig(
  config: SuiteConfig,
  options: { configDir: string },
): Promise<ValidateSuiteConfigResult> {
  const diagnostics: SuiteDiagnostic[] = [];
  const tracesDir = path.resolve(options.configDir, config.traces);
  try {
    await access(tracesDir);
  } catch {
    diagnostics.push(
      diagnostic("AI_SUITE_CONFIG_INVALID", `traces directory not found: ${tracesDir}`),
    );
  }

  for (const suiteCase of config.cases) {
    if (suiteCase.input !== undefined) {
      const inputPath = path.resolve(options.configDir, suiteCase.input);
      try {
        await access(inputPath);
      } catch {
        diagnostics.push(
          diagnostic(
            "AI_SUITE_CONFIG_INVALID",
            `input fixture not found: ${suiteCase.input}`,
            "warning",
            suiteCase.id,
          ),
        );
      }
    }
  }

  return { ok: diagnostics.every((item) => item.severity !== "error"), diagnostics };
}
