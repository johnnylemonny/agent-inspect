import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

import {
  TraceReadError,
  openTrace,
  type TraceReadResult,
} from "@agent-inspect/core/readers";
import {
  TraceDirectory,
  aggregateSessionCheckResults,
  filterMetasBySessionScope,
  loadSessionRunRecords,
  loadTraceMetadataList,
  parseDuration,
  resolveTraceDir,
} from "@agent-inspect/core/advanced";
import {
  createLlmUsageRule,
  createMaxStepDurationRule,
  createRequireCompletedRule,
  createRunDepthRule,
  createRunDurationRule,
  createObservedOutcomeRule,
  createRunStatusRule,
  createStallDetectionRule,
  createSafetyOversizedAttributeRule,
  createSafetyRawContentRule,
  createSafetyRedactionRule,
  createSafetySecretPatternRule,
  createStructureCycleRule,
  createStructureOrphanRule,
  createStructureParallelWidthRule,
  createStructureRelationshipRule,
  createToolUsageRule,
  defineTraceContract,
  evaluateTraceContract,
  runTraceChecks,
  ATTRIBUTION_CONFIDENCES,
  isAttributionConfidence,
  type ControlStage,
  type LlmUsageRuleOptions,
  type RunStatusRuleOptions,
  type SafetyOversizedAttributeRuleOptions,
  type StructureRelationshipRuleOptions,
  type ToolArgumentCheck,
  type ToolUsageRuleOptions,
  type TraceCheckDiagnostic,
  type TraceCheckDiagnosticCode,
  type TraceCheckResult,
  type TraceCheckRule,
  type TraceContract,
  type TraceContractAlternatives,
  type TraceContractBody,
  type TraceContractControlRules,
  type TraceContractInput,
  type TraceContractRecoveryOperation,
  type TraceContractRetryRules,
  type TraceContractScope,
} from "@agent-inspect/core/checks";

import {
  checkResultToEvidenceJson,
  parseEvidenceFormat,
  parseEvidenceProfile,
  resolveEvidenceOutputDir,
  shouldEmitEvidence,
  writeLocalEvidence,
  type EvidenceOnMode,
} from "./evidence-on.js";
import { inputFromTarget } from "./trace-input.js";
import { mergeSafetyExtensions } from "./safety-extensions.js";

export interface CheckCommandOptions {
  dir?: string;
  format?: string;
  run?: string;
  config?: string;
  json?: boolean;
  rule?: string[];
  maxDurationMs?: string;
  requiredTool?: string[];
  /** Canonical CLI spelling: `--forbidden-tool`. */
  forbiddenTool?: string[];
  /** Compatibility alias: `--forbid-tool` (same semantics as `forbiddenTool`). */
  forbidTool?: string[];
  allowedModel?: string[];
  maxTotalTokens?: string;
  session?: string;
  group?: string;
  correlateGroup?: boolean;
  guardrails?: string[];
  circuit?: string[];
  maxStepDuration?: string;
  requireCompleted?: boolean;
  detectStalls?: boolean;
  failOnObservation?: string;
  /** Additive check preset: trajectory | safety | comprehensive | behavioral-session. */
  preset?: string;
  /** Local Evidence v2 emit mode: fail | always | never. */
  evidenceOn?: EvidenceOnMode;
  evidenceDir?: string;
  evidenceProfile?: string;
  evidenceFormat?: string;
}

export const CHECK_PRESET_NAMES = [
  "trajectory",
  "safety",
  "comprehensive",
  "behavioral-session",
] as const;
export type CheckPresetName = (typeof CHECK_PRESET_NAMES)[number];

export interface ResolvePresetContext {
  /** When true, trajectory/comprehensive select includes tool.usage. */
  hasToolRules?: boolean;
}

export interface ResolvedPreset {
  requireCompleted: boolean;
  enableSafetyRedaction: boolean;
  /** Inject structure.requireParentBeforeChild when config lacks relationship options. */
  enableStructureRelationshipDefaults: boolean;
  select: string[];
  /** Default `--fail-on-observation` for behavioral-session (does not override explicit flag). */
  failOnObservation?: string;
}

const DEFAULT_SELECT = ["run.status"];

/**
 * Preserve first-seen order while dropping empty and duplicate rule ids.
 */
export function uniqueSelectIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const trimmed = id.trim();
    if (trimmed === "" || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Rule ids implied by CLI shorthand flags on this invocation.
 * Does not include config-only constructed rules.
 */
export function resolveForbiddenToolOptions(options: CheckCommandOptions): string[] {
  const merged = [...(options.forbiddenTool ?? []), ...(options.forbidTool ?? [])];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of merged) {
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

export function withResolvedForbiddenTools(
  options: CheckCommandOptions,
): CheckCommandOptions {
  return {
    ...options,
    forbiddenTool: resolveForbiddenToolOptions(options),
    forbidTool: undefined,
  };
}

export function cliShorthandSelectIds(options: CheckCommandOptions): string[] {
  const ids: string[] = [];
  if (options.failOnObservation !== undefined && options.failOnObservation.trim() !== "") {
    ids.push("outcome.status");
  }
  if (
    (options.requiredTool?.length ?? 0) > 0 ||
    (options.forbiddenTool?.length ?? 0) > 0 ||
    (options.forbidTool?.length ?? 0) > 0
  ) {
    ids.push("tool.usage");
  }
  if ((options.allowedModel?.length ?? 0) > 0 || options.maxTotalTokens !== undefined) {
    ids.push("llm.usage");
  }
  if (options.maxDurationMs !== undefined) {
    ids.push("run.duration");
  }
  if (options.maxStepDuration !== undefined) {
    ids.push("run.maxStepDuration");
  }
  if (options.detectStalls === true) {
    ids.push("run.stall");
  }
  return ids;
}

/**
 * Canonical check select union:
 * 1. Preset base ids
 * 2. Explicit `--rule`
 * 3. Config `checks.select` (no silent expansion of unrelated configured rules)
 * 4. CLI shorthand ids used on this invocation
 * Empty explicit select (no preset / `--rule` / config select) keeps auto-select
 * of constructed rules plus default `run.status`.
 */
export function unionCheckSelect(input: {
  presetSelect?: readonly string[];
  explicitRules?: readonly string[];
  configSelect?: readonly string[];
  shorthandIds?: readonly string[];
  constructedRuleIds?: readonly string[];
}): string[] {
  const explicit = uniqueSelectIds([
    ...(input.presetSelect ?? []),
    ...(input.explicitRules ?? []),
    ...(input.configSelect ?? []),
  ]);
  if (explicit.length === 0) {
    return uniqueSelectIds([
      ...DEFAULT_SELECT,
      ...(input.constructedRuleIds ?? []).filter((id) => id !== "run.status"),
    ]);
  }
  const constructed = new Set(input.constructedRuleIds ?? []);
  const shorthand = (input.shorthandIds ?? []).filter(
    (id) => constructed.size === 0 || constructed.has(id),
  );
  return uniqueSelectIds([...explicit, ...shorthand]);
}

/**
 * Resolve an additive check preset into option/select patches.
 * Omitting preset returns undefined and leaves default check behavior unchanged.
 */
export function resolvePreset(
  preset: string | undefined,
  context: ResolvePresetContext = {},
): ResolvedPreset | undefined {
  if (preset === undefined || preset.trim() === "") return undefined;
  const name = preset.trim().toLowerCase();
  if (
    name !== "trajectory" &&
    name !== "safety" &&
    name !== "comprehensive" &&
    name !== "behavioral-session"
  ) {
    throw new Error(
      `Unknown --preset "${preset}". Use trajectory, safety, comprehensive, or behavioral-session.`,
    );
  }

  const trajectorySelect = [
    "run.status",
    "run.requireCompleted",
    "structure.orphan",
    "structure.cycle",
    "structure.relationship",
  ];
  if (context.hasToolRules === true) {
    trajectorySelect.push("tool.usage");
  }

  // Rule id for createSafetyRawContentRule is safety.rawPrompt.
  const safetySelect = [
    "run.status",
    "safety.rawPrompt",
    "safety.secretPattern",
    "safety.redaction",
  ];

  if (name === "trajectory") {
    return {
      requireCompleted: true,
      enableSafetyRedaction: false,
      enableStructureRelationshipDefaults: true,
      select: trajectorySelect,
    };
  }
  if (name === "safety") {
    return {
      requireCompleted: false,
      enableSafetyRedaction: true,
      enableStructureRelationshipDefaults: false,
      select: safetySelect,
    };
  }
  if (name === "behavioral-session") {
    // Dual-axis: require harness completion + outcome scoring; do not collapse on tool error.
    return {
      requireCompleted: true,
      enableSafetyRedaction: false,
      enableStructureRelationshipDefaults: false,
      select: ["run.requireCompleted", "outcome.status", "structure.orphan"],
      failOnObservation: "failed",
    };
  }

  const select = [...new Set([...trajectorySelect, ...safetySelect])];
  return {
    requireCompleted: true,
    enableSafetyRedaction: true,
    enableStructureRelationshipDefaults: true,
    select,
  };
}

type CheckConfig = {
  checks?: {
    select?: string[];
    run?: RunStatusRuleOptions & {
      maxDurationMs?: number;
      maxDepth?: number;
    };
    tool?: ToolUsageRuleOptions;
    llm?: LlmUsageRuleOptions;
    structure?: StructureRelationshipRuleOptions & {
      orphan?: boolean;
      cycle?: boolean;
      maxChildren?: number;
      maxConcurrent?: number;
    };
    safety?: SafetyOversizedAttributeRuleOptions & {
      redaction?: boolean;
      rawContent?: boolean;
      secretPattern?: boolean;
    };
  };
  /**
   * Strict JSON TraceContract body for `check --config`.
   * Mutually exclusive with an effective top-level `checks` block.
   */
  contract?: TraceContractInput;
};

type RuleBuildResult = {
  rules: TraceCheckRule[];
  select: string[];
  diagnostics: TraceCheckDiagnostic[];
};

const CONFIG_EXTENSIONS = new Set([".json", ".js", ".mjs", ".cjs"]);
const TS_CONFIG_EXTENSIONS = new Set([".ts", ".mts", ".cts"]);

function diagnostic(
  code: TraceCheckDiagnosticCode,
  message: string,
  severity: TraceCheckDiagnostic["severity"] = "error",
): TraceCheckDiagnostic {
  return { code, message, severity };
}

function errorResult(
  code: TraceCheckDiagnosticCode,
  message: string,
  format = "unknown",
): TraceCheckResult {
  const diagnostics = [diagnostic(code, message)];
  return {
    ok: false,
    status: "error",
    format,
    summary: {
      passed: 0,
      failed: 0,
      warnings: 0,
      errors: 1,
      rulesEvaluated: 0,
      rulesPassed: 0,
      rulesWarning: 0,
      rulesFailed: 0,
      rulesError: 0,
    },
    findings: [],
    diagnostics,
    ruleExecutions: [],
  };
}

function parseNumber(value: string | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return parsed;
}

function asStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("Expected an array of strings.");
  }
  return value;
}

const CHECKS_KEYS = new Set(["select", "run", "tool", "llm", "structure", "safety"]);
const ROOT_CONFIG_KEYS = new Set(["checks", "contract"]);
/** Top-level TraceContract keys (includes scope + alternatives). */
const CONTRACT_KEYS = new Set([
  "run",
  "tools",
  "llm",
  "steps",
  "observations",
  "scope",
  "alternatives",
  "controls",
  "retry",
]);
/** Body keys only — no nested alternatives. */
const CONTRACT_BODY_KEYS = new Set([
  "run",
  "tools",
  "llm",
  "steps",
  "observations",
  "controls",
  "retry",
]);
const CONTRACT_SCOPE_KEYS = new Set([
  "runId",
  "subAgentId",
  "groupId",
  "workflowStep",
  "rootEventId",
]);
const CONTRACT_RUN_KEYS = new Set(["requireCompleted", "allowedStatuses", "maxDurationMs"]);
const CONTRACT_TOOLS_KEYS = new Set([
  "required",
  "requiredTools",
  "forbidden",
  "forbiddenTools",
  "allowed",
  "maxCalls",
  "requiredOrder",
  "requiredOrderMode",
  "arguments",
  "orderRules",
  "defaultOccurrenceMode",
]);
const CONTRACT_LLM_KEYS = new Set(["maxCalls", "maxTotalTokens", "allowedModels"]);
const CONTRACT_OBSERVATION_KEYS = new Set(["required", "failOn", "requireProvenance"]);
const CONTRACT_PROVENANCE_KEYS = new Set(["method", "evidence", "sameRunEventReference"]);
const CONTRACT_CONTROLS_KEYS = new Set([
  "declaredTools",
  "enforcedTools",
  "declaredToolsAttribute",
  "enforcedToolsAttribute",
  "requireDeclaredMatchesEnforced",
  "requireObservedWithinEnforced",
  "requireObservedWithinDeclared",
  "requiredStages",
]);
const CONTRACT_CONTROL_STAGES = new Set([
  "declared",
  "presented",
  "validated",
  "enforced",
  "observed",
  "accepted",
]);
const CONTRACT_CONTROL_STAGE_KEYS = new Set(["stage", "observation"]);
const CONTRACT_RETRY_KEYS = new Set([
  "maxAttempts",
  "requireTerminalResult",
  "fallbackOnlyAfterFailure",
  "nonIdempotentTools",
  "requireIdempotencyEvidenceForRetry",
  "requireRecoveredFailureVisible",
  "operations",
]);
const CONTRACT_OPERATION_KEYS = new Set([
  "tool",
  "maxAttempts",
  "retryableErrors",
  "requireFailureBeforeRetry",
  "requireSameArguments",
  "requireTerminalSuccess",
  "requireRecoveredFailureVisible",
  "successfulResultDependency",
  "sideEffectClass",
]);
const CONTRACT_RETRYABLE_ERRORS_KEYS = new Set(["codes"]);
const CONTRACT_RESULT_DEP_KEYS = new Set(["consumerKind", "requireExplicitReference"]);
const CONTRACT_ALT_KEYS = new Set(["anyOf"]);
const CONTRACT_ALT_BRANCH_KEYS = new Set(["id", "description", "contract"]);
const CONTRACT_ORDER_RULE_KEYS = new Set([
  "before",
  "after",
  "occurrenceMode",
  "requireEndpoints",
]);
const CONTRACT_STEPS_KEYS = new Set(["orderRelations"]);
const CONTRACT_STEP_ORDER_RELATION_KEYS = new Set([
  "before",
  "after",
  "mode",
  "requireEndpoints",
]);
const CONTRACT_STEP_REF_KEYS = new Set(["kind", "name"]);
const CONTRACT_STEP_KINDS = new Set(["TOOL", "LLM"]);
const CONTRACT_ARGUMENT_KEYS = new Set([
  "tool",
  "path",
  "operator",
  "occurrence",
  "expected",
  "oneOf",
  "type",
]);
const CONTRACT_ARGUMENT_OPERATORS = new Set(["exists", "type", "equals", "oneOf"]);
const CONTRACT_ARGUMENT_OCCURRENCES = new Set(["first", "last", "any", "all"]);
const CONTRACT_ARGUMENT_TYPES = new Set([
  "string",
  "number",
  "boolean",
  "object",
  "array",
  "null",
]);
const CONTRACT_ORDER_MODES = new Set([
  "first-occurrence",
  "happens-before",
  "all-occurrences",
]);
const CONTRACT_FAIL_ON = new Set(["failed", "unknown", "skipped"]);
const CONTRACT_SIDE_EFFECT_CLASSES = new Set(["read", "write"]);
/** Bounded list sizes for strict CLI contract JSON. */
const CONTRACT_MAX_STRING_LIST = 64;
const CONTRACT_MAX_ARGUMENTS = 32;
const CONTRACT_MAX_ORDER_RULES = 32;
const CONTRACT_MAX_ANY_OF = 16;
const CONTRACT_MAX_OPERATIONS = 32;
const CONTRACT_MAX_REQUIRED_STAGES = 16;
const CONTRACT_MAX_ONE_OF = 32;
const RUN_KEYS = new Set(["expected", "allowIncomplete", "maxDurationMs", "maxDepth"]);
const TOOL_KEYS = new Set(["required", "forbidden", "allowed", "minCount", "maxCount"]);
const LLM_KEYS = new Set([
  "allowedModels",
  "allowedProviders",
  "finishReasons",
  "maxCalls",
  "maxTotalTokens",
  "maxInputTokens",
  "maxOutputTokens",
  "maxCachedTokens",
]);
const STRUCTURE_KEYS = new Set([
  "minConfidence",
  "requireParentBeforeChild",
  "requireTraceParentSpan",
  "orphan",
  "cycle",
  "maxChildren",
  "maxConcurrent",
]);
const SAFETY_KEYS = new Set([
  "redaction",
  "rawContent",
  "secretPattern",
  "maxStringLength",
  "maxArrayLength",
  "maxObjectKeys",
  "maxSerializedBytes",
  "maxFindings",
]);
const RUN_EXPECTED = new Set(["ok", "error", "running"]);
const CONFIDENCE_LIST = ATTRIBUTION_CONFIDENCES.join(", ");

class CheckConfigError extends Error {
  readonly code: TraceCheckDiagnosticCode;
  constructor(code: TraceCheckDiagnosticCode, message: string) {
    super(message);
    this.name = "CheckConfigError";
    this.code = code;
  }
}

function closestKey(unknown: string, known: readonly string[]): string | undefined {
  const lower = unknown.toLowerCase();
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of known) {
    if (candidate.toLowerCase() === lower) return candidate;
    // Simple edit-distance proxy for typo suggestions.
    let distance = Math.abs(candidate.length - unknown.length);
    const max = Math.max(candidate.length, unknown.length);
    for (let i = 0; i < Math.min(candidate.length, unknown.length); i += 1) {
      if (candidate[i]!.toLowerCase() !== unknown[i]!.toLowerCase()) distance += 1;
    }
    if (distance < bestDistance && distance <= Math.max(2, Math.floor(max / 3))) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

function rejectUnknownKeys(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  pathPrefix: string,
): void {
  for (const key of Object.keys(record)) {
    if (allowed.has(key)) continue;
    const suggestion = closestKey(key, [...allowed]);
    const hint = suggestion ? ` Did you mean "${suggestion}"?` : "";
    throw new CheckConfigError(
      "AI_CHECK_CONFIG_UNKNOWN_KEY",
      `Unknown check config key "${pathPrefix}.${key}".${hint}`,
    );
  }
}

function requireObject(value: unknown, pathPrefix: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new CheckConfigError(
      "AI_CHECK_CONFIG_INVALID_VALUE",
      `${pathPrefix} must be an object.`,
    );
  }
  return value as Record<string, unknown>;
}

function requireStringArray(value: unknown, pathPrefix: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new CheckConfigError(
      "AI_CHECK_CONFIG_INVALID_VALUE",
      `${pathPrefix} must be an array of non-empty strings.`,
    );
  }
  return value as string[];
}

function requireNonNegativeNumber(value: unknown, pathPrefix: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new CheckConfigError(
      "AI_CHECK_CONFIG_INVALID_VALUE",
      `${pathPrefix} must be a finite non-negative number.`,
    );
  }
  return value;
}

function requireBoolean(value: unknown, pathPrefix: string): boolean {
  if (typeof value !== "boolean") {
    throw new CheckConfigError(
      "AI_CHECK_CONFIG_INVALID_VALUE",
      `${pathPrefix} must be a boolean.`,
    );
  }
  return value;
}

function requireNonEmptyString(value: unknown, pathPrefix: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new CheckConfigError(
      "AI_CHECK_CONFIG_INVALID_VALUE",
      `${pathPrefix} must be a non-empty string.`,
    );
  }
  return value;
}

function requireBoundedArray(
  value: unknown,
  pathPrefix: string,
  max: number,
): unknown[] {
  if (!Array.isArray(value)) {
    throw new CheckConfigError(
      "AI_CHECK_CONFIG_INVALID_VALUE",
      `${pathPrefix} must be an array.`,
    );
  }
  if (value.length > max) {
    throw new CheckConfigError(
      "AI_CHECK_CONFIG_INVALID_VALUE",
      `${pathPrefix} exceeds bound of ${max} items.`,
    );
  }
  return value;
}

function requireBoundedStringArray(
  value: unknown,
  pathPrefix: string,
  max: number = CONTRACT_MAX_STRING_LIST,
): string[] {
  const items = requireBoundedArray(value, pathPrefix, max);
  if (items.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new CheckConfigError(
      "AI_CHECK_CONFIG_INVALID_VALUE",
      `${pathPrefix} must be an array of non-empty strings.`,
    );
  }
  return items as string[];
}

function requireOrderMode(
  value: unknown,
  pathPrefix: string,
): "first-occurrence" | "happens-before" | "all-occurrences" {
  if (typeof value !== "string" || !CONTRACT_ORDER_MODES.has(value)) {
    throw new CheckConfigError(
      "AI_CHECK_CONFIG_INVALID_VALUE",
      `${pathPrefix} must be one of: "first-occurrence", "happens-before", "all-occurrences".`,
    );
  }
  return value as "first-occurrence" | "happens-before" | "all-occurrences";
}

function parseRunSection(value: unknown): NonNullable<CheckConfig["checks"]>["run"] {
  const record = requireObject(value, "checks.run");
  rejectUnknownKeys(record, RUN_KEYS, "checks.run");
  const out: NonNullable<CheckConfig["checks"]>["run"] = {};
  if (record.expected !== undefined) {
    if (typeof record.expected !== "string" || !RUN_EXPECTED.has(record.expected)) {
      throw new CheckConfigError(
        "AI_CHECK_CONFIG_INVALID_VALUE",
        `checks.run.expected must be one of: ok, error, running.`,
      );
    }
    out.expected = record.expected as "ok" | "error" | "running";
  }
  if (record.allowIncomplete !== undefined) {
    out.allowIncomplete = requireBoolean(record.allowIncomplete, "checks.run.allowIncomplete");
  }
  if (record.maxDurationMs !== undefined) {
    out.maxDurationMs = requireNonNegativeNumber(record.maxDurationMs, "checks.run.maxDurationMs");
  }
  if (record.maxDepth !== undefined) {
    out.maxDepth = requireNonNegativeNumber(record.maxDepth, "checks.run.maxDepth");
  }
  return out;
}

function parseToolSection(value: unknown): ToolUsageRuleOptions {
  const record = requireObject(value, "checks.tool");
  rejectUnknownKeys(record, TOOL_KEYS, "checks.tool");
  const out: ToolUsageRuleOptions = {};
  if (record.required !== undefined) out.required = requireStringArray(record.required, "checks.tool.required");
  if (record.forbidden !== undefined) out.forbidden = requireStringArray(record.forbidden, "checks.tool.forbidden");
  if (record.allowed !== undefined) out.allowed = requireStringArray(record.allowed, "checks.tool.allowed");
  if (record.minCount !== undefined) out.minCount = requireNonNegativeNumber(record.minCount, "checks.tool.minCount");
  if (record.maxCount !== undefined) out.maxCount = requireNonNegativeNumber(record.maxCount, "checks.tool.maxCount");
  return out;
}

function parseLlmSection(value: unknown): LlmUsageRuleOptions {
  const record = requireObject(value, "checks.llm");
  rejectUnknownKeys(record, LLM_KEYS, "checks.llm");
  const out: LlmUsageRuleOptions = {};
  if (record.allowedModels !== undefined) {
    out.allowedModels = requireStringArray(record.allowedModels, "checks.llm.allowedModels");
  }
  if (record.allowedProviders !== undefined) {
    out.allowedProviders = requireStringArray(record.allowedProviders, "checks.llm.allowedProviders");
  }
  if (record.finishReasons !== undefined) {
    out.finishReasons = requireStringArray(record.finishReasons, "checks.llm.finishReasons");
  }
  if (record.maxCalls !== undefined) out.maxCalls = requireNonNegativeNumber(record.maxCalls, "checks.llm.maxCalls");
  if (record.maxTotalTokens !== undefined) {
    out.maxTotalTokens = requireNonNegativeNumber(record.maxTotalTokens, "checks.llm.maxTotalTokens");
  }
  if (record.maxInputTokens !== undefined) {
    out.maxInputTokens = requireNonNegativeNumber(record.maxInputTokens, "checks.llm.maxInputTokens");
  }
  if (record.maxOutputTokens !== undefined) {
    out.maxOutputTokens = requireNonNegativeNumber(record.maxOutputTokens, "checks.llm.maxOutputTokens");
  }
  if (record.maxCachedTokens !== undefined) {
    out.maxCachedTokens = requireNonNegativeNumber(record.maxCachedTokens, "checks.llm.maxCachedTokens");
  }
  return out;
}

function parseStructureSection(
  value: unknown,
): NonNullable<CheckConfig["checks"]>["structure"] {
  const record = requireObject(value, "checks.structure");
  rejectUnknownKeys(record, STRUCTURE_KEYS, "checks.structure");
  const out: NonNullable<CheckConfig["checks"]>["structure"] = {};
  if (record.minConfidence !== undefined) {
    if (!isAttributionConfidence(record.minConfidence)) {
      throw new CheckConfigError(
        "AI_CHECK_CONFIG_INVALID_VALUE",
        `checks.structure.minConfidence must be one of: ${CONFIDENCE_LIST}.`,
      );
    }
    out.minConfidence = record.minConfidence;
  }
  if (record.requireParentBeforeChild !== undefined) {
    out.requireParentBeforeChild = requireBoolean(
      record.requireParentBeforeChild,
      "checks.structure.requireParentBeforeChild",
    );
  }
  if (record.requireTraceParentSpan !== undefined) {
    out.requireTraceParentSpan = requireBoolean(
      record.requireTraceParentSpan,
      "checks.structure.requireTraceParentSpan",
    );
  }
  if (record.orphan !== undefined) out.orphan = requireBoolean(record.orphan, "checks.structure.orphan");
  if (record.cycle !== undefined) out.cycle = requireBoolean(record.cycle, "checks.structure.cycle");
  if (record.maxChildren !== undefined) {
    out.maxChildren = requireNonNegativeNumber(record.maxChildren, "checks.structure.maxChildren");
  }
  if (record.maxConcurrent !== undefined) {
    out.maxConcurrent = requireNonNegativeNumber(record.maxConcurrent, "checks.structure.maxConcurrent");
  }
  return out;
}

function parseSafetySection(
  value: unknown,
): NonNullable<CheckConfig["checks"]>["safety"] {
  const record = requireObject(value, "checks.safety");
  rejectUnknownKeys(record, SAFETY_KEYS, "checks.safety");
  const out: NonNullable<CheckConfig["checks"]>["safety"] = {};
  if (record.redaction !== undefined) out.redaction = requireBoolean(record.redaction, "checks.safety.redaction");
  if (record.rawContent !== undefined) out.rawContent = requireBoolean(record.rawContent, "checks.safety.rawContent");
  if (record.secretPattern !== undefined) {
    out.secretPattern = requireBoolean(record.secretPattern, "checks.safety.secretPattern");
  }
  if (record.maxStringLength !== undefined) {
    out.maxStringLength = requireNonNegativeNumber(record.maxStringLength, "checks.safety.maxStringLength");
  }
  if (record.maxArrayLength !== undefined) {
    out.maxArrayLength = requireNonNegativeNumber(record.maxArrayLength, "checks.safety.maxArrayLength");
  }
  if (record.maxObjectKeys !== undefined) {
    out.maxObjectKeys = requireNonNegativeNumber(record.maxObjectKeys, "checks.safety.maxObjectKeys");
  }
  if (record.maxSerializedBytes !== undefined) {
    out.maxSerializedBytes = requireNonNegativeNumber(
      record.maxSerializedBytes,
      "checks.safety.maxSerializedBytes",
    );
  }
  if (record.maxFindings !== undefined) {
    out.maxFindings = requireNonNegativeNumber(record.maxFindings, "checks.safety.maxFindings");
  }
  return out;
}

function sectionHasEffect(section: Record<string, unknown> | undefined): boolean {
  if (section === undefined) return false;
  return Object.keys(section).length > 0;
}

/** True when the parsed config itself configures rules, select, or disables defaults. */
export function checkConfigHasEffect(config: CheckConfig): boolean {
  if (contractConfigHasEffect(config.contract)) return true;
  const checks = config.checks;
  if (checks === undefined) return false;
  if ((checks.select?.length ?? 0) > 0) return true;
  if (sectionHasEffect(checks.run as Record<string, unknown> | undefined)) return true;
  if (sectionHasEffect(checks.tool as Record<string, unknown> | undefined)) return true;
  if (sectionHasEffect(checks.llm as Record<string, unknown> | undefined)) return true;
  if (sectionHasEffect(checks.structure as Record<string, unknown> | undefined)) return true;
  if (sectionHasEffect(checks.safety as Record<string, unknown> | undefined)) return true;
  return false;
}

function contractConfigHasEffect(contract: TraceContractInput | undefined): boolean {
  if (contract === undefined) return false;
  // scope alone is not enough — body rules (or alternatives) required
  if (sectionHasEffect(contract.run as Record<string, unknown> | undefined)) return true;
  if (sectionHasEffect(contract.tools as Record<string, unknown> | undefined)) return true;
  if (sectionHasEffect(contract.llm as Record<string, unknown> | undefined)) return true;
  if (sectionHasEffect(contract.steps as Record<string, unknown> | undefined)) return true;
  if (sectionHasEffect(contract.observations as Record<string, unknown> | undefined)) {
    return true;
  }
  if (sectionHasEffect(contract.controls as Record<string, unknown> | undefined)) return true;
  if (sectionHasEffect(contract.retry as Record<string, unknown> | undefined)) return true;
  if ((contract.alternatives?.anyOf?.length ?? 0) > 0) return true;
  return false;
}

function parseContractRunSection(
  value: unknown,
  pathPrefix = "contract.run",
): NonNullable<TraceContractBody["run"]> {
  const record = requireObject(value, pathPrefix);
  rejectUnknownKeys(record, CONTRACT_RUN_KEYS, pathPrefix);
  const out: NonNullable<TraceContractBody["run"]> = {};
  if (record.requireCompleted !== undefined) {
    out.requireCompleted = requireBoolean(
      record.requireCompleted,
      `${pathPrefix}.requireCompleted`,
    );
  }
  if (record.allowedStatuses !== undefined) {
    const statuses = requireBoundedStringArray(
      record.allowedStatuses,
      `${pathPrefix}.allowedStatuses`,
    );
    const allowed = new Set(["ok", "error", "running", "success", "failed"]);
    for (let i = 0; i < statuses.length; i++) {
      const status = statuses[i]!;
      if (!allowed.has(status)) {
        throw new CheckConfigError(
          "AI_CHECK_CONFIG_INVALID_VALUE",
          `${pathPrefix}.allowedStatuses[${i}] must be one of: ok, error, running (aliases: success, failed); got ${JSON.stringify(status)}.`,
        );
      }
    }
    out.allowedStatuses = statuses;
  }
  if (record.maxDurationMs !== undefined) {
    out.maxDurationMs = requireNonNegativeNumber(
      record.maxDurationMs,
      `${pathPrefix}.maxDurationMs`,
    );
  }
  return out;
}

function parseToolArgumentCheck(value: unknown, pathPrefix: string): ToolArgumentCheck {
  const record = requireObject(value, pathPrefix);
  rejectUnknownKeys(record, CONTRACT_ARGUMENT_KEYS, pathPrefix);
  const tool = requireNonEmptyString(record.tool, `${pathPrefix}.tool`);
  if (typeof record.path !== "string") {
    throw new CheckConfigError(
      "AI_CHECK_CONFIG_INVALID_VALUE",
      `${pathPrefix}.path must be a string JSON Pointer (\"\" or start with \"/\").`,
    );
  }
  const pathValue = record.path;
  if (typeof record.operator !== "string" || !CONTRACT_ARGUMENT_OPERATORS.has(record.operator)) {
    throw new CheckConfigError(
      "AI_CHECK_CONFIG_INVALID_VALUE",
      `${pathPrefix}.operator must be one of: "exists", "type", "equals", "oneOf".`,
    );
  }
  const operator = record.operator as ToolArgumentCheck["operator"];
  const out: ToolArgumentCheck = { tool, path: pathValue, operator };
  if (record.occurrence !== undefined) {
    if (
      typeof record.occurrence !== "string" ||
      !CONTRACT_ARGUMENT_OCCURRENCES.has(record.occurrence)
    ) {
      throw new CheckConfigError(
        "AI_CHECK_CONFIG_INVALID_VALUE",
        `${pathPrefix}.occurrence must be one of: "first", "last", "any", "all".`,
      );
    }
    out.occurrence = record.occurrence as ToolArgumentCheck["occurrence"];
  }
  if (record.expected !== undefined) {
    out.expected = record.expected;
  }
  if (record.oneOf !== undefined) {
    out.oneOf = requireBoundedArray(record.oneOf, `${pathPrefix}.oneOf`, CONTRACT_MAX_ONE_OF);
  }
  if (record.type !== undefined) {
    if (typeof record.type !== "string" || !CONTRACT_ARGUMENT_TYPES.has(record.type)) {
      throw new CheckConfigError(
        "AI_CHECK_CONFIG_INVALID_VALUE",
        `${pathPrefix}.type must be one of: "string", "number", "boolean", "object", "array", "null".`,
      );
    }
    out.type = record.type as ToolArgumentCheck["type"];
  }
  return out;
}

function parseOrderRule(
  value: unknown,
  pathPrefix: string,
): NonNullable<NonNullable<TraceContractBody["tools"]>["orderRules"]>[number] {
  const record = requireObject(value, pathPrefix);
  rejectUnknownKeys(record, CONTRACT_ORDER_RULE_KEYS, pathPrefix);
  const out: NonNullable<NonNullable<TraceContractBody["tools"]>["orderRules"]>[number] = {
    before: requireNonEmptyString(record.before, `${pathPrefix}.before`),
    after: requireNonEmptyString(record.after, `${pathPrefix}.after`),
  };
  if (record.occurrenceMode !== undefined) {
    out.occurrenceMode = requireOrderMode(record.occurrenceMode, `${pathPrefix}.occurrenceMode`);
  }
  if (record.requireEndpoints !== undefined) {
    out.requireEndpoints = requireBoolean(
      record.requireEndpoints,
      `${pathPrefix}.requireEndpoints`,
    );
  }
  return out;
}

function parseContractToolsSection(
  value: unknown,
  pathPrefix = "contract.tools",
): NonNullable<TraceContractBody["tools"]> {
  const record = requireObject(value, pathPrefix);
  rejectUnknownKeys(record, CONTRACT_TOOLS_KEYS, pathPrefix);
  const out: NonNullable<TraceContractBody["tools"]> = {};
  if (record.required !== undefined) {
    out.required = requireBoundedStringArray(record.required, `${pathPrefix}.required`);
  }
  if (record.requiredTools !== undefined) {
    out.requiredTools = requireBoundedStringArray(
      record.requiredTools,
      `${pathPrefix}.requiredTools`,
    );
  }
  if (record.forbidden !== undefined) {
    out.forbidden = requireBoundedStringArray(record.forbidden, `${pathPrefix}.forbidden`);
  }
  if (record.forbiddenTools !== undefined) {
    out.forbiddenTools = requireBoundedStringArray(
      record.forbiddenTools,
      `${pathPrefix}.forbiddenTools`,
    );
  }
  if (record.allowed !== undefined) {
    out.allowed = requireBoundedStringArray(record.allowed, `${pathPrefix}.allowed`);
  }
  if (record.maxCalls !== undefined) {
    out.maxCalls = requireNonNegativeNumber(record.maxCalls, `${pathPrefix}.maxCalls`);
  }
  if (record.requiredOrder !== undefined) {
    out.requiredOrder = requireBoundedStringArray(
      record.requiredOrder,
      `${pathPrefix}.requiredOrder`,
    );
  }
  if (record.requiredOrderMode !== undefined) {
    out.requiredOrderMode = requireOrderMode(
      record.requiredOrderMode,
      `${pathPrefix}.requiredOrderMode`,
    );
  }
  if (record.defaultOccurrenceMode !== undefined) {
    out.defaultOccurrenceMode = requireOrderMode(
      record.defaultOccurrenceMode,
      `${pathPrefix}.defaultOccurrenceMode`,
    );
  }
  if (record.arguments !== undefined) {
    const items = requireBoundedArray(
      record.arguments,
      `${pathPrefix}.arguments`,
      CONTRACT_MAX_ARGUMENTS,
    );
    out.arguments = items.map((item, index) =>
      parseToolArgumentCheck(item, `${pathPrefix}.arguments[${index}]`),
    );
  }
  if (record.orderRules !== undefined) {
    const items = requireBoundedArray(
      record.orderRules,
      `${pathPrefix}.orderRules`,
      CONTRACT_MAX_ORDER_RULES,
    );
    out.orderRules = items.map((item, index) =>
      parseOrderRule(item, `${pathPrefix}.orderRules[${index}]`),
    );
  }
  return out;
}

function parseContractLlmSection(
  value: unknown,
  pathPrefix = "contract.llm",
): NonNullable<TraceContractBody["llm"]> {
  const record = requireObject(value, pathPrefix);
  rejectUnknownKeys(record, CONTRACT_LLM_KEYS, pathPrefix);
  const out: NonNullable<TraceContractBody["llm"]> = {};
  if (record.maxCalls !== undefined) {
    out.maxCalls = requireNonNegativeNumber(record.maxCalls, `${pathPrefix}.maxCalls`);
  }
  if (record.maxTotalTokens !== undefined) {
    out.maxTotalTokens = requireNonNegativeNumber(
      record.maxTotalTokens,
      `${pathPrefix}.maxTotalTokens`,
    );
  }
  if (record.allowedModels !== undefined) {
    out.allowedModels = requireBoundedStringArray(
      record.allowedModels,
      `${pathPrefix}.allowedModels`,
    );
  }
  return out;
}

function parseStepRef(
  value: unknown,
  pathPrefix: string,
): NonNullable<NonNullable<TraceContractBody["steps"]>["orderRelations"]>[number]["before"] {
  const record = requireObject(value, pathPrefix);
  rejectUnknownKeys(record, CONTRACT_STEP_REF_KEYS, pathPrefix);
  if (typeof record.kind !== "string" || !CONTRACT_STEP_KINDS.has(record.kind)) {
    throw new CheckConfigError(
      "AI_CHECK_CONFIG_INVALID_VALUE",
      `${pathPrefix}.kind must be "TOOL" or "LLM".`,
    );
  }
  return {
    kind: record.kind as "TOOL" | "LLM",
    name: requireNonEmptyString(record.name, `${pathPrefix}.name`),
  };
}

function parseStepOrderRelation(
  value: unknown,
  pathPrefix: string,
): NonNullable<NonNullable<TraceContractBody["steps"]>["orderRelations"]>[number] {
  const record = requireObject(value, pathPrefix);
  rejectUnknownKeys(record, CONTRACT_STEP_ORDER_RELATION_KEYS, pathPrefix);
  if (record.before === undefined) {
    throw new CheckConfigError(
      "AI_CHECK_CONFIG_INVALID_VALUE",
      `${pathPrefix}.before is required.`,
    );
  }
  if (record.after === undefined) {
    throw new CheckConfigError(
      "AI_CHECK_CONFIG_INVALID_VALUE",
      `${pathPrefix}.after is required.`,
    );
  }
  const out: NonNullable<NonNullable<TraceContractBody["steps"]>["orderRelations"]>[number] = {
    before: parseStepRef(record.before, `${pathPrefix}.before`),
    after: parseStepRef(record.after, `${pathPrefix}.after`),
  };
  if (record.mode !== undefined) {
    out.mode = requireOrderMode(record.mode, `${pathPrefix}.mode`);
  }
  if (record.requireEndpoints !== undefined) {
    out.requireEndpoints = requireBoolean(
      record.requireEndpoints,
      `${pathPrefix}.requireEndpoints`,
    );
  }
  return out;
}

function parseContractStepsSection(
  value: unknown,
  pathPrefix = "contract.steps",
): NonNullable<TraceContractBody["steps"]> {
  const record = requireObject(value, pathPrefix);
  rejectUnknownKeys(record, CONTRACT_STEPS_KEYS, pathPrefix);
  const out: NonNullable<TraceContractBody["steps"]> = {};
  if (record.orderRelations !== undefined) {
    const items = requireBoundedArray(
      record.orderRelations,
      `${pathPrefix}.orderRelations`,
      CONTRACT_MAX_ORDER_RULES,
    );
    out.orderRelations = items.map((item, index) =>
      parseStepOrderRelation(item, `${pathPrefix}.orderRelations[${index}]`),
    );
  }
  return out;
}

function parseRequireProvenance(
  value: unknown,
  pathPrefix: string,
): NonNullable<NonNullable<TraceContractBody["observations"]>["requireProvenance"]> {
  const record = requireObject(value, pathPrefix);
  rejectUnknownKeys(record, CONTRACT_PROVENANCE_KEYS, pathPrefix);
  const out: NonNullable<NonNullable<TraceContractBody["observations"]>["requireProvenance"]> =
    {};
  if (record.method !== undefined) {
    out.method = requireBoolean(record.method, `${pathPrefix}.method`);
  }
  if (record.evidence !== undefined) {
    out.evidence = requireBoolean(record.evidence, `${pathPrefix}.evidence`);
  }
  if (record.sameRunEventReference !== undefined) {
    out.sameRunEventReference = requireBoolean(
      record.sameRunEventReference,
      `${pathPrefix}.sameRunEventReference`,
    );
  }
  return out;
}

function parseContractObservationsSection(
  value: unknown,
  pathPrefix = "contract.observations",
): NonNullable<TraceContractBody["observations"]> {
  const record = requireObject(value, pathPrefix);
  rejectUnknownKeys(record, CONTRACT_OBSERVATION_KEYS, pathPrefix);
  const out: NonNullable<TraceContractBody["observations"]> = {};
  if (record.required !== undefined) {
    out.required = requireBoundedStringArray(record.required, `${pathPrefix}.required`);
  }
  if (record.failOn !== undefined) {
    const items = requireBoundedArray(record.failOn, `${pathPrefix}.failOn`, CONTRACT_MAX_STRING_LIST);
    for (const item of items) {
      if (typeof item !== "string" || !CONTRACT_FAIL_ON.has(item)) {
        throw new CheckConfigError(
          "AI_CHECK_CONFIG_INVALID_VALUE",
          `${pathPrefix}.failOn values must be "failed", "unknown", or "skipped".`,
        );
      }
    }
    out.failOn = items as Array<"failed" | "unknown" | "skipped">;
  }
  if (record.requireProvenance !== undefined) {
    out.requireProvenance = parseRequireProvenance(
      record.requireProvenance,
      `${pathPrefix}.requireProvenance`,
    );
  }
  return out;
}

function parseControlRequiredStage(
  value: unknown,
  pathPrefix: string,
): NonNullable<TraceContractControlRules["requiredStages"]>[number] {
  const record = requireObject(value, pathPrefix);
  rejectUnknownKeys(record, CONTRACT_CONTROL_STAGE_KEYS, pathPrefix);
  if (typeof record.stage !== "string" || !CONTRACT_CONTROL_STAGES.has(record.stage)) {
    throw new CheckConfigError(
      "AI_CHECK_CONFIG_INVALID_VALUE",
      `${pathPrefix}.stage must be one of: declared, presented, validated, enforced, observed, accepted.`,
    );
  }
  const out: NonNullable<TraceContractControlRules["requiredStages"]>[number] = {
    stage: record.stage as ControlStage,
  };
  if (record.observation !== undefined) {
    out.observation = requireNonEmptyString(record.observation, `${pathPrefix}.observation`);
  }
  return out;
}

function parseContractControlsSection(
  value: unknown,
  pathPrefix = "contract.controls",
): TraceContractControlRules {
  const record = requireObject(value, pathPrefix);
  rejectUnknownKeys(record, CONTRACT_CONTROLS_KEYS, pathPrefix);
  const out: TraceContractControlRules = {};
  if (record.declaredTools !== undefined) {
    out.declaredTools = requireBoundedStringArray(
      record.declaredTools,
      `${pathPrefix}.declaredTools`,
    );
  }
  if (record.enforcedTools !== undefined) {
    out.enforcedTools = requireBoundedStringArray(
      record.enforcedTools,
      `${pathPrefix}.enforcedTools`,
    );
  }
  if (record.declaredToolsAttribute !== undefined) {
    out.declaredToolsAttribute = requireNonEmptyString(
      record.declaredToolsAttribute,
      `${pathPrefix}.declaredToolsAttribute`,
    );
  }
  if (record.enforcedToolsAttribute !== undefined) {
    out.enforcedToolsAttribute = requireNonEmptyString(
      record.enforcedToolsAttribute,
      `${pathPrefix}.enforcedToolsAttribute`,
    );
  }
  if (record.requireDeclaredMatchesEnforced !== undefined) {
    out.requireDeclaredMatchesEnforced = requireBoolean(
      record.requireDeclaredMatchesEnforced,
      `${pathPrefix}.requireDeclaredMatchesEnforced`,
    );
  }
  if (record.requireObservedWithinEnforced !== undefined) {
    out.requireObservedWithinEnforced = requireBoolean(
      record.requireObservedWithinEnforced,
      `${pathPrefix}.requireObservedWithinEnforced`,
    );
  }
  if (record.requireObservedWithinDeclared !== undefined) {
    out.requireObservedWithinDeclared = requireBoolean(
      record.requireObservedWithinDeclared,
      `${pathPrefix}.requireObservedWithinDeclared`,
    );
  }
  if (record.requiredStages !== undefined) {
    const items = requireBoundedArray(
      record.requiredStages,
      `${pathPrefix}.requiredStages`,
      CONTRACT_MAX_REQUIRED_STAGES,
    );
    out.requiredStages = items.map((item, index) =>
      parseControlRequiredStage(item, `${pathPrefix}.requiredStages[${index}]`),
    );
  }
  return out;
}

function parseRecoveryOperation(
  value: unknown,
  pathPrefix: string,
): TraceContractRecoveryOperation {
  const record = requireObject(value, pathPrefix);
  rejectUnknownKeys(record, CONTRACT_OPERATION_KEYS, pathPrefix);
  const out: TraceContractRecoveryOperation = {
    tool: requireNonEmptyString(record.tool, `${pathPrefix}.tool`),
  };
  if (record.maxAttempts !== undefined) {
    out.maxAttempts = requireNonNegativeNumber(record.maxAttempts, `${pathPrefix}.maxAttempts`);
  }
  if (record.retryableErrors !== undefined) {
    const errors = requireObject(record.retryableErrors, `${pathPrefix}.retryableErrors`);
    rejectUnknownKeys(errors, CONTRACT_RETRYABLE_ERRORS_KEYS, `${pathPrefix}.retryableErrors`);
    const retryableErrors: NonNullable<TraceContractRecoveryOperation["retryableErrors"]> = {};
    if (errors.codes !== undefined) {
      retryableErrors.codes = requireBoundedStringArray(
        errors.codes,
        `${pathPrefix}.retryableErrors.codes`,
      );
    }
    out.retryableErrors = retryableErrors;
  }
  if (record.requireFailureBeforeRetry !== undefined) {
    out.requireFailureBeforeRetry = requireBoolean(
      record.requireFailureBeforeRetry,
      `${pathPrefix}.requireFailureBeforeRetry`,
    );
  }
  if (record.requireSameArguments !== undefined) {
    if (record.requireSameArguments === true || record.requireSameArguments === false) {
      out.requireSameArguments = record.requireSameArguments;
    } else if (record.requireSameArguments === "structured-or-digest") {
      out.requireSameArguments = "structured-or-digest";
    } else {
      throw new CheckConfigError(
        "AI_CHECK_CONFIG_INVALID_VALUE",
        `${pathPrefix}.requireSameArguments must be a boolean or "structured-or-digest".`,
      );
    }
  }
  if (record.requireTerminalSuccess !== undefined) {
    out.requireTerminalSuccess = requireBoolean(
      record.requireTerminalSuccess,
      `${pathPrefix}.requireTerminalSuccess`,
    );
  }
  if (record.requireRecoveredFailureVisible !== undefined) {
    out.requireRecoveredFailureVisible = requireBoolean(
      record.requireRecoveredFailureVisible,
      `${pathPrefix}.requireRecoveredFailureVisible`,
    );
  }
  if (record.successfulResultDependency !== undefined) {
    const dep = requireObject(
      record.successfulResultDependency,
      `${pathPrefix}.successfulResultDependency`,
    );
    rejectUnknownKeys(dep, CONTRACT_RESULT_DEP_KEYS, `${pathPrefix}.successfulResultDependency`);
    if (dep.consumerKind !== "LLM") {
      throw new CheckConfigError(
        "AI_CHECK_CONFIG_INVALID_VALUE",
        `${pathPrefix}.successfulResultDependency.consumerKind must be "LLM".`,
      );
    }
    const dependency: NonNullable<
      TraceContractRecoveryOperation["successfulResultDependency"]
    > = { consumerKind: "LLM" };
    if (dep.requireExplicitReference !== undefined) {
      dependency.requireExplicitReference = requireBoolean(
        dep.requireExplicitReference,
        `${pathPrefix}.successfulResultDependency.requireExplicitReference`,
      );
    }
    out.successfulResultDependency = dependency;
  }
  if (record.sideEffectClass !== undefined) {
    if (
      typeof record.sideEffectClass !== "string" ||
      !CONTRACT_SIDE_EFFECT_CLASSES.has(record.sideEffectClass)
    ) {
      throw new CheckConfigError(
        "AI_CHECK_CONFIG_INVALID_VALUE",
        `${pathPrefix}.sideEffectClass must be "read" or "write".`,
      );
    }
    out.sideEffectClass = record.sideEffectClass as "read" | "write";
  }
  return out;
}

function parseContractRetrySection(
  value: unknown,
  pathPrefix = "contract.retry",
): TraceContractRetryRules {
  const record = requireObject(value, pathPrefix);
  rejectUnknownKeys(record, CONTRACT_RETRY_KEYS, pathPrefix);
  const out: TraceContractRetryRules = {};
  if (record.maxAttempts !== undefined) {
    out.maxAttempts = requireNonNegativeNumber(record.maxAttempts, `${pathPrefix}.maxAttempts`);
  }
  if (record.requireTerminalResult !== undefined) {
    out.requireTerminalResult = requireBoolean(
      record.requireTerminalResult,
      `${pathPrefix}.requireTerminalResult`,
    );
  }
  if (record.fallbackOnlyAfterFailure !== undefined) {
    out.fallbackOnlyAfterFailure = requireBoolean(
      record.fallbackOnlyAfterFailure,
      `${pathPrefix}.fallbackOnlyAfterFailure`,
    );
  }
  if (record.nonIdempotentTools !== undefined) {
    out.nonIdempotentTools = requireBoundedStringArray(
      record.nonIdempotentTools,
      `${pathPrefix}.nonIdempotentTools`,
    );
  }
  if (record.requireIdempotencyEvidenceForRetry !== undefined) {
    out.requireIdempotencyEvidenceForRetry = requireBoolean(
      record.requireIdempotencyEvidenceForRetry,
      `${pathPrefix}.requireIdempotencyEvidenceForRetry`,
    );
  }
  if (record.requireRecoveredFailureVisible !== undefined) {
    out.requireRecoveredFailureVisible = requireBoolean(
      record.requireRecoveredFailureVisible,
      `${pathPrefix}.requireRecoveredFailureVisible`,
    );
  }
  if (record.operations !== undefined) {
    const items = requireBoundedArray(
      record.operations,
      `${pathPrefix}.operations`,
      CONTRACT_MAX_OPERATIONS,
    );
    out.operations = items.map((item, index) =>
      parseRecoveryOperation(item, `${pathPrefix}.operations[${index}]`),
    );
  }
  return out;
}

function parseContractScopeSection(value: unknown): TraceContractScope {
  const record = requireObject(value, "contract.scope");
  rejectUnknownKeys(record, CONTRACT_SCOPE_KEYS, "contract.scope");
  const out: TraceContractScope = {};
  if (record.runId !== undefined) {
    out.runId = requireNonEmptyString(record.runId, "contract.scope.runId");
  }
  if (record.subAgentId !== undefined) {
    out.subAgentId = requireNonEmptyString(record.subAgentId, "contract.scope.subAgentId");
  }
  if (record.groupId !== undefined) {
    out.groupId = requireNonEmptyString(record.groupId, "contract.scope.groupId");
  }
  if (record.workflowStep !== undefined) {
    out.workflowStep = requireNonEmptyString(
      record.workflowStep,
      "contract.scope.workflowStep",
    );
  }
  if (record.rootEventId !== undefined) {
    out.rootEventId = requireNonEmptyString(record.rootEventId, "contract.scope.rootEventId");
  }
  return out;
}

/**
 * Parse a contract body (run/tools/llm/observations/controls/retry).
 * Rejects nested `alternatives` as an unknown key.
 */
function parseContractBodySection(value: unknown, pathPrefix: string): TraceContractBody {
  const record = requireObject(value, pathPrefix);
  rejectUnknownKeys(record, CONTRACT_BODY_KEYS, pathPrefix);
  const out: TraceContractBody = {};
  if (record.run !== undefined) out.run = parseContractRunSection(record.run, `${pathPrefix}.run`);
  if (record.tools !== undefined) {
    out.tools = parseContractToolsSection(record.tools, `${pathPrefix}.tools`);
  }
  if (record.llm !== undefined) out.llm = parseContractLlmSection(record.llm, `${pathPrefix}.llm`);
  if (record.steps !== undefined) {
    out.steps = parseContractStepsSection(record.steps, `${pathPrefix}.steps`);
  }
  if (record.observations !== undefined) {
    out.observations = parseContractObservationsSection(
      record.observations,
      `${pathPrefix}.observations`,
    );
  }
  if (record.controls !== undefined) {
    out.controls = parseContractControlsSection(record.controls, `${pathPrefix}.controls`);
  }
  if (record.retry !== undefined) {
    out.retry = parseContractRetrySection(record.retry, `${pathPrefix}.retry`);
  }
  return out;
}

function parseContractAlternativesSection(value: unknown): TraceContractAlternatives {
  const record = requireObject(value, "contract.alternatives");
  rejectUnknownKeys(record, CONTRACT_ALT_KEYS, "contract.alternatives");
  if (record.anyOf === undefined) {
    throw new CheckConfigError(
      "AI_CHECK_CONFIG_INVALID_VALUE",
      "contract.alternatives.anyOf is required.",
    );
  }
  const items = requireBoundedArray(
    record.anyOf,
    "contract.alternatives.anyOf",
    CONTRACT_MAX_ANY_OF,
  );
  const anyOf = items.map((item, index) => {
    const pathPrefix = `contract.alternatives.anyOf[${index}]`;
    const branch = requireObject(item, pathPrefix);
    rejectUnknownKeys(branch, CONTRACT_ALT_BRANCH_KEYS, pathPrefix);
    const id = requireNonEmptyString(branch.id, `${pathPrefix}.id`);
    if (branch.contract === undefined) {
      throw new CheckConfigError(
        "AI_CHECK_CONFIG_INVALID_VALUE",
        `${pathPrefix}.contract is required.`,
      );
    }
    const out: TraceContractAlternatives["anyOf"][number] = {
      id,
      contract: parseContractBodySection(branch.contract, `${pathPrefix}.contract`),
    };
    if (branch.description !== undefined) {
      out.description = requireNonEmptyString(branch.description, `${pathPrefix}.description`);
    }
    return out;
  });
  return { anyOf };
}

/**
 * Strict parser for top-level TraceContract JSON (slice B: deferred keys).
 * Rejects unknown nested keys; bounds list sizes; no nested alternatives.
 */
function parseContractSection(value: unknown): TraceContractInput {
  const record = requireObject(value, "contract");
  rejectUnknownKeys(record, CONTRACT_KEYS, "contract");
  const bodyOnly: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if (CONTRACT_BODY_KEYS.has(key)) bodyOnly[key] = record[key];
  }
  const out: TraceContractInput = { ...parseContractBodySection(bodyOnly, "contract") };
  if (record.scope !== undefined) out.scope = parseContractScopeSection(record.scope);
  if (record.alternatives !== undefined) {
    out.alternatives = parseContractAlternativesSection(record.alternatives);
  }
  return out;
}

/**
 * Strict runtime parser for CLI `--config` JSON/JS objects.
 * Rejects unknown keys and invalid value types; never silently ignores typos.
 */
export function parseCheckConfig(value: unknown): CheckConfig {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new CheckConfigError("AI_CHECK_CONFIG_INVALID_VALUE", "Config must export an object.");
  }
  const root = value as Record<string, unknown>;
  const rootKeys = Object.keys(root);
  for (const key of rootKeys) {
    if (ROOT_CONFIG_KEYS.has(key)) continue;
    const suggestion = closestKey(key, [...ROOT_CONFIG_KEYS]);
    const hint = suggestion ? ` Did you mean "${suggestion}"?` : "";
    throw new CheckConfigError(
      "AI_CHECK_CONFIG_UNKNOWN_KEY",
      `Unknown top-level check config key "${key}". Allowed: checks, contract.${hint}`,
    );
  }

  const out: CheckConfig = {};
  if ("checks" in root) {
    const checksRecord = requireObject(root.checks, "checks");
    rejectUnknownKeys(checksRecord, CHECKS_KEYS, "checks");
    const checks: NonNullable<CheckConfig["checks"]> = {};
    if (checksRecord.select !== undefined) {
      checks.select = requireStringArray(checksRecord.select, "checks.select");
    }
    if (checksRecord.run !== undefined) checks.run = parseRunSection(checksRecord.run);
    if (checksRecord.tool !== undefined) checks.tool = parseToolSection(checksRecord.tool);
    if (checksRecord.llm !== undefined) checks.llm = parseLlmSection(checksRecord.llm);
    if (checksRecord.structure !== undefined) {
      checks.structure = parseStructureSection(checksRecord.structure);
    }
    if (checksRecord.safety !== undefined) checks.safety = parseSafetySection(checksRecord.safety);
    out.checks = checks;
  }
  if ("contract" in root) {
    out.contract = parseContractSection(root.contract);
  }
  if (
    out.contract !== undefined &&
    contractConfigHasEffect(out.contract) &&
    checkConfigHasEffect({ checks: out.checks })
  ) {
    throw new CheckConfigError(
      "AI_CHECK_CONFIG_INVALID_VALUE",
      'Config cannot combine top-level "checks" and "contract". Use one vocabulary per config file.',
    );
  }
  return out;
}

async function loadConfig(configPath: string | undefined): Promise<CheckConfig> {
  if (configPath === undefined) return {};
  const extension = path.extname(configPath);
  if (TS_CONFIG_EXTENSIONS.has(extension)) {
    throw new CheckConfigError(
      "AI_CHECK_CONFIG_LOAD_FAILED",
      "TypeScript check configs require an explicit precompiled JavaScript config or future --config-loader support.",
    );
  }
  if (!CONFIG_EXTENSIONS.has(extension)) {
    throw new CheckConfigError(
      "AI_CHECK_CONFIG_LOAD_FAILED",
      "Unsupported check config extension. Use .json, .js, .mjs, or .cjs.",
    );
  }

  const absolute = path.resolve(configPath);
  try {
    if (extension === ".json") {
      const raw = await readFile(absolute, "utf-8");
      return parseCheckConfig(JSON.parse(raw));
    }

    return parseCheckConfig(await importJsCheckConfig(absolute));
  } catch (error) {
    if (error instanceof CheckConfigError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new CheckConfigError(
      "AI_CHECK_CONFIG_LOAD_FAILED",
      `Failed to load check config: ${message}`,
    );
  }
}

/**
 * Load a JS/MJS/CJS check config export.
 *
 * Under Vitest/Vite, absolute dynamic imports outside the workspace fail even
 * when the file exists. Fall back to a clean Node subprocess so CLI tests and
 * temp configs keep working without depending on Vite's module graph.
 */
async function importJsCheckConfig(absolute: string): Promise<unknown> {
  const href = pathToFileURL(absolute).href;
  if (!process.env.VITEST) {
    const mod = await import(/* @vite-ignore */ href);
    return "default" in mod ? mod.default : mod;
  }

  const script = `
const mod = await import(${JSON.stringify(href)});
const value = "default" in mod ? mod.default : mod;
process.stdout.write(JSON.stringify({ ok: true, value }));
`;
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.VITEST;
  delete env.VITEST_WORKER_ID;
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    ["--input-type=module", "--eval", script],
    {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      env,
    },
  );
  try {
    const parsed = JSON.parse(stdout) as { ok?: boolean; value?: unknown };
    if (parsed.ok !== true) {
      throw new Error(stderr.trim() || "Check config module did not return a value");
    }
    return parsed.value;
  } catch (error) {
    if (stderr.trim()) {
      throw new Error(stderr.trim());
    }
    throw error instanceof Error ? error : new Error(String(error));
  }
}

function normalizeConfig(config: CheckConfig): NonNullable<CheckConfig["checks"]> {
  if (config.checks === undefined) return {};
  if (typeof config.checks !== "object" || Array.isArray(config.checks)) {
    throw new CheckConfigError("AI_CHECK_CONFIG_INVALID_VALUE", "checks config must be an object.");
  }
  return config.checks;
}

function hasToolRulesConfigured(
  config: CheckConfig,
  options: CheckCommandOptions,
): boolean {
  const tool = normalizeConfig(config).tool ?? {};
  return Boolean(
    (tool.required?.length ?? 0) > 0 ||
      (tool.forbidden?.length ?? 0) > 0 ||
      (tool.allowed?.length ?? 0) > 0 ||
      tool.minCount !== undefined ||
      tool.maxCount !== undefined ||
      (options.requiredTool?.length ?? 0) > 0 ||
      (options.forbiddenTool?.length ?? 0) > 0,
  );
}

function applyResolvedPreset(
  config: CheckConfig,
  options: CheckCommandOptions,
  resolved: ResolvedPreset,
): { config: CheckConfig; options: CheckCommandOptions } {
  const checks = { ...normalizeConfig(config) };

  if (resolved.enableSafetyRedaction) {
    checks.safety = { ...checks.safety, redaction: true };
  }

  if (resolved.enableStructureRelationshipDefaults) {
    const structure = checks.structure ?? {};
    const needed =
      structure.minConfidence === undefined &&
      structure.requireParentBeforeChild === undefined &&
      structure.requireTraceParentSpan === undefined;
    if (needed) {
      checks.structure = { ...structure, requireParentBeforeChild: true };
    }
  }

  return {
    config: { checks },
    options: {
      ...options,
      ...(resolved.requireCompleted ? { requireCompleted: true } : {}),
      ...(resolved.failOnObservation !== undefined &&
      (options.failOnObservation === undefined || options.failOnObservation.trim() === "")
        ? { failOnObservation: resolved.failOnObservation }
        : {}),
    },
  };
}

function buildRules(
  config: CheckConfig,
  options: CheckCommandOptions,
  presetSelect: readonly string[] = [],
): RuleBuildResult {
  const diagnostics: TraceCheckDiagnostic[] = [];
  const checks = normalizeConfig(config);
  const run = checks.run ?? {};
  const tool = checks.tool ?? {};
  const llm = checks.llm ?? {};
  const structure = checks.structure ?? {};
  const safety = checks.safety ?? {};
  const maxDurationMs =
    parseNumber(options.maxDurationMs, "--max-duration-ms") ?? run.maxDurationMs;
  const maxTotalTokens =
    parseNumber(options.maxTotalTokens, "--max-total-tokens") ?? llm.maxTotalTokens;
  let maxStepDurationMs: number | undefined;
  if (options.maxStepDuration !== undefined) {
    try {
      maxStepDurationMs = parseDuration(options.maxStepDuration.trim());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      diagnostics.push(
        diagnostic("AI_CHECK_INVALID_ARGUMENTS", `--max-step-duration: ${message}`),
      );
    }
  }
  const rules: TraceCheckRule[] = [
    createRunStatusRule(run),
    createStructureOrphanRule(),
    createStructureCycleRule(),
    createSafetyRawContentRule(),
    createSafetySecretPatternRule(),
  ];

  if (maxDurationMs !== undefined) {
    rules.push(createRunDurationRule({ maxDurationMs }));
  }
  if (maxStepDurationMs !== undefined) {
    rules.push(createMaxStepDurationRule({ maxDurationMs: maxStepDurationMs }));
  }
  if (options.requireCompleted) {
    rules.push(createRequireCompletedRule());
  }
  if (options.detectStalls) {
    rules.push(createStallDetectionRule({ requireEndedAt: true }));
  }
  if (options.failOnObservation !== undefined && options.failOnObservation.trim() !== "") {
    try {
      const statuses = options.failOnObservation
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value !== "")
        .map((value) => {
          if (
            value === "passed" ||
            value === "failed" ||
            value === "unknown" ||
            value === "skipped"
          ) {
            return value as "passed" | "failed" | "unknown" | "skipped";
          }
          throw new Error(`unsupported status "${value}"`);
        });
      rules.push(createObservedOutcomeRule({ failOn: statuses, requireAny: true }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      diagnostics.push(
        diagnostic("AI_CHECK_INVALID_ARGUMENTS", `--fail-on-observation: ${message}`),
      );
    }
  }
  if (run.maxDepth !== undefined) {
    rules.push(createRunDepthRule({ maxDepth: run.maxDepth }));
  }

  const toolOptions: ToolUsageRuleOptions = {
    ...tool,
    required: [...(tool.required ?? []), ...(options.requiredTool ?? [])],
    forbidden: [...(tool.forbidden ?? []), ...(options.forbiddenTool ?? [])],
  };
  if (
    toolOptions.required?.length ||
    toolOptions.forbidden?.length ||
    toolOptions.allowed?.length ||
    toolOptions.minCount !== undefined ||
    toolOptions.maxCount !== undefined
  ) {
    rules.push(createToolUsageRule(toolOptions));
  }

  const llmOptions: LlmUsageRuleOptions = {
    ...llm,
    allowedModels: [...(llm.allowedModels ?? []), ...(options.allowedModel ?? [])],
    ...(maxTotalTokens !== undefined ? { maxTotalTokens } : {}),
  };
  if (
    llmOptions.allowedModels?.length ||
    llmOptions.allowedProviders?.length ||
    llmOptions.finishReasons?.length ||
    llmOptions.maxCalls !== undefined ||
    llmOptions.maxInputTokens !== undefined ||
    llmOptions.maxOutputTokens !== undefined ||
    llmOptions.maxTotalTokens !== undefined ||
    llmOptions.maxCachedTokens !== undefined
  ) {
    rules.push(createLlmUsageRule(llmOptions));
  }

  if (
    structure.minConfidence !== undefined ||
    structure.requireParentBeforeChild !== undefined ||
    structure.requireTraceParentSpan !== undefined
  ) {
    rules.push(createStructureRelationshipRule(structure));
  }
  if (structure.maxChildren !== undefined || structure.maxConcurrent !== undefined) {
    rules.push(
      createStructureParallelWidthRule({
        maxChildren: structure.maxChildren,
        maxConcurrent: structure.maxConcurrent,
      }),
    );
  }
  if (safety.redaction) rules.push(createSafetyRedactionRule());
  if (safety.maxStringLength !== undefined || safety.maxArrayLength !== undefined || safety.maxObjectKeys !== undefined || safety.maxSerializedBytes !== undefined) {
    rules.push(createSafetyOversizedAttributeRule(safety));
  }

  const constructedRuleIds = rules.map((rule) => rule.id);
  const shorthandIds = cliShorthandSelectIds(options);
  const select = unionCheckSelect({
    presetSelect,
    explicitRules: options.rule ?? [],
    configSelect: asStringArray(checks.select) ?? [],
    shorthandIds,
    constructedRuleIds,
  });

  return {
    rules,
    select,
    diagnostics,
  };
}

function exitCodeFor(result: TraceCheckResult): number {
  if (result.status === "pass") return 0;
  if (result.status === "fail") return 1;
  const codes = result.diagnostics.map((item) => item.code);
  if (
    codes.some((code) =>
      code === "AI_CHECK_UNSUPPORTED_FORMAT" ||
      code === "AI_CHECK_AMBIGUOUS_FORMAT"
    )
  ) {
    return 4;
  }
  if (
    codes.some((code) =>
      code === "AI_CHECK_TRACE_UNREADABLE" ||
      code === "AI_CHECK_BASELINE_UNREADABLE"
    )
  ) {
    return 3;
  }
  if (
    codes.some((code) =>
      code === "AI_CHECK_INVALID_ARGUMENTS" ||
      code === "AI_CHECK_INVALID_CONFIG" ||
      code === "AI_CHECK_CONFIG_LOAD_FAILED" ||
      code === "AI_CHECK_CONFIG_UNKNOWN_KEY" ||
      code === "AI_CHECK_CONFIG_INVALID_VALUE" ||
      code === "AI_CHECK_CONFIG_NO_EFFECTIVE_RULES" ||
      code === "AI_CHECK_NO_RULES_EVALUATED" ||
      code === "AI_CHECK_RUN_SELECTION_REQUIRED"
    )
  ) {
    return 2;
  }
  return 1;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value === null || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => [key, stable(record[key])]),
  );
}

function printJson(result: TraceCheckResult): void {
  console.log(JSON.stringify(stable(result), null, 2));
}

function isSafetyFinding(ruleId: string): boolean {
  return (
    ruleId.startsWith("safety.") ||
    ruleId.startsWith("guardrail.") ||
    ruleId.includes("pii") ||
    ruleId.includes("secret")
  );
}

function printPresetClassSummary(
  result: TraceCheckResult,
  preset: string | undefined,
): void {
  const name = preset?.trim().toLowerCase();
  if (
    name !== "trajectory" &&
    name !== "safety" &&
    name !== "comprehensive" &&
    name !== "behavioral-session"
  ) {
    return;
  }
  if (name === "behavioral-session") {
    console.log(
      `Behavioral session: ${result.status === "pass" ? "PASS" : "FAIL"} (outcomes scored; tool errors may be expected)`,
    );
    return;
  }
  const hasSafetyFindings = result.findings.some((finding) =>
    isSafetyFinding(finding.ruleId),
  );
  const hasTrajectoryFindings = result.findings.some(
    (finding) => !isSafetyFinding(finding.ruleId),
  );

  if (name === "trajectory") {
    console.log(
      `Trajectory: ${result.status === "pass" && !hasTrajectoryFindings ? "PASS" : result.status === "pass" ? "PASS" : "FAIL"}`,
    );
    console.log("Share safety: not evaluated");
    console.log("Run verify-safe before sharing.");
    return;
  }
  if (name === "safety") {
    console.log(
      `Share safety: ${result.status === "pass" && !hasSafetyFindings ? "PASS" : result.status === "pass" ? "PASS" : "FAIL"}`,
    );
    return;
  }
  console.log(
    `Trajectory: ${hasTrajectoryFindings || result.status === "error" ? "FAIL" : "PASS"}`,
  );
  console.log(
    `Share safety: ${hasSafetyFindings || result.status === "fail" ? "FAIL" : result.status === "pass" ? "PASS" : "FAIL"}`,
  );
}

function printHuman(
  result: TraceCheckResult,
  options: CheckCommandOptions = {},
): void {
  const scoped = result as {
    scopeKind?: string;
    scopeLabel?: string;
    runIds?: string[];
    runResults?: Array<{ runId: string; status: string }>;
  };
  if (scoped.scopeLabel) {
    console.log(`Scope: ${scoped.scopeKind} ${scoped.scopeLabel}`);
    if (scoped.runIds?.length) {
      console.log(`Runs: ${scoped.runIds.join(", ")}`);
    }
  }
  console.log(`Check status: ${result.status}`);
  printPresetClassSummary(result, options.preset);
  console.log(`Format: ${result.format}`);
  if (result.runId !== undefined) console.log(`Run: ${result.runId}`);
  console.log(
    `Findings: ${result.summary.failed} failed, ${result.summary.warnings} warning(s), ${result.summary.errors} error(s), ${result.summary.passed} passed`,
  );
  console.log(
    `Rules: ${result.summary.rulesEvaluated ?? result.ruleExecutions?.length ?? 0} evaluated` +
      ` (${result.summary.rulesPassed ?? 0} passed, ${result.summary.rulesWarning ?? 0} warning, ${result.summary.rulesFailed ?? 0} failed, ${result.summary.rulesError ?? 0} error)`,
  );
  for (const diagnostic of result.diagnostics) {
    console.log(`- ${diagnostic.code}: ${diagnostic.message}`);
  }
  for (const finding of result.findings) {
    const path = finding.evidence[0]?.path;
    const run = finding.evidence[0]?.runId;
    const runPrefix = run ? `[${run}] ` : "";
    console.log(`- ${runPrefix}${finding.ruleId}: ${finding.message}${path ? ` (${path})` : ""}`);
  }
}

function readErrorResult(error: unknown): TraceCheckResult {
  if (error instanceof TraceReadError) {
    const code =
      error.code === "unsupported_format"
        ? "AI_CHECK_UNSUPPORTED_FORMAT"
        : error.code === "ambiguous_format"
          ? "AI_CHECK_AMBIGUOUS_FORMAT"
          : "AI_CHECK_TRACE_UNREADABLE";
    return errorResult(code, error.message);
  }
  return errorResult(
    "AI_CHECK_TRACE_UNREADABLE",
    error instanceof Error ? error.message : String(error),
  );
}

export async function checkCommand(
  target: string,
  options: CheckCommandOptions = {},
  stdin: NodeJS.ReadableStream = process.stdin,
): Promise<void> {
  options = withResolvedForbiddenTools(options);
  let result: TraceCheckResult;
  let phase: "config" | "read" = "config";
  let evidenceRead: TraceReadResult | undefined;
  let evidenceRunIds: string[] = [];
  let evidenceSourceContents: Map<string, string> | undefined;
  let evidenceContract: TraceContract | undefined;

  const sessionId = options.session?.trim();
  const groupId = options.group?.trim();
  const useSessionScope = Boolean(sessionId || groupId);

  try {
    let config = await loadConfig(options.config);
    if (options.config !== undefined && !checkConfigHasEffect(config)) {
      result = errorResult(
        "AI_CHECK_CONFIG_NO_EFFECTIVE_RULES",
        "Explicit --config has no effective check rules. Configure checks.select, checks.run, checks.tool, checks.llm, checks.structure, checks.safety, or contract.",
      );
      if (options.json) printJson(result);
      else printHuman(result, options);
      process.exitCode = exitCodeFor(result);
      return;
    }
    let effectiveOptions = options;
    const useContract =
      config.contract !== undefined && contractConfigHasEffect(config.contract);
    if (useContract) {
      evidenceContract = defineTraceContract(config.contract!);
    }
    const resolved = useContract
      ? undefined
      : resolvePreset(options.preset, {
          hasToolRules: hasToolRulesConfigured(config, options),
        });
    if (resolved !== undefined) {
      const applied = applyResolvedPreset(config, options, resolved);
      config = applied.config;
      effectiveOptions = applied.options;
    }
    const built = useContract
      ? { rules: [] as TraceCheckRule[], select: [] as string[], diagnostics: [] as TraceCheckDiagnostic[] }
      : buildRules(config, effectiveOptions, resolved?.select ?? []);
    if (built.diagnostics.some((item) => item.severity === "error")) {
      result = errorResult("AI_CHECK_INVALID_CONFIG", "Invalid check configuration.");
      result.diagnostics = [...built.diagnostics];
    } else if (useSessionScope) {
      phase = "read";
      const traceDir = resolveTraceDir({ dir: options.dir });
      const td = new TraceDirectory({ dir: traceDir });
      const files = await td.list();
      const metas = await loadTraceMetadataList(traceDir, files, (fileName) =>
        td.getPath(fileName),
      );
      const records = await loadSessionRunRecords(metas);
      const scoped = filterMetasBySessionScope(metas, records, {
        ...(sessionId ? { sessionId } : {}),
        ...(groupId ? { groupId } : {}),
        correlateByGroupId: options.correlateGroup === true,
      });
      const perRun: TraceCheckResult[] = [];
      const sourceContents = new Map<string, string>();
      const definedContract = evidenceContract;
      for (const meta of scoped.metas) {
        const read = await openTrace(
          { type: "file", path: meta.filePath },
          {
            ...(options.format !== undefined ? { format: options.format } : {}),
          },
        );
        try {
          sourceContents.set(meta.runId, await readFile(meta.filePath, "utf-8"));
        } catch {
          sourceContents.set(
            meta.runId,
            `${read.events.map((event) => JSON.stringify(event)).join("\n")}\n`,
          );
        }
        const base = definedContract
          ? evaluateTraceContract({ read }, definedContract, { runId: meta.runId })
          : runTraceChecks(
              { read },
              {
                rules: built.rules,
                select: built.select,
                runId: meta.runId,
              },
            );
        perRun.push(
          mergeSafetyExtensions(base, read, {
            ...(options.guardrails ? { guardrails: options.guardrails } : {}),
            ...(options.circuit ? { circuits: options.circuit } : {}),
            runId: meta.runId,
          }),
        );
      }
      evidenceRunIds = scoped.runIds;
      evidenceSourceContents = sourceContents;
      result = aggregateSessionCheckResults(perRun, {
        scopeKind: scoped.scopeKind,
        scopeLabel: scoped.scopeLabel,
        runIds: scoped.runIds,
        sessionWarnings: scoped.warnings,
        notFound: scoped.notFound,
        empty: scoped.metas.length === 0,
      });
    } else {
      phase = "read";
      const input = await inputFromTarget(target, options, stdin);
      const read = await openTrace(input, {
        ...(options.format !== undefined ? { format: options.format } : {}),
      });
      evidenceRead = read;
      evidenceRunIds =
        options.run !== undefined
          ? [options.run]
          : read.runs.length === 1
            ? [read.runs[0]!.runId]
            : read.runs.map((run) => run.runId);
      if (input.type === "file") {
        try {
          const raw = await readFile(input.path, "utf-8");
          evidenceSourceContents = new Map(
            evidenceRunIds.map((runId) => [runId, raw]),
          );
        } catch {
          evidenceSourceContents = undefined;
        }
      } else {
        evidenceSourceContents = new Map(
          evidenceRunIds.map((runId) => [
            runId,
            `${read.events
              .filter((event) => event.runId === runId)
              .map((event) => JSON.stringify(event))
              .join("\n")}\n`,
          ]),
        );
      }
      const base = useContract && evidenceContract !== undefined
        ? evaluateTraceContract(
            { read },
            evidenceContract,
            {
              ...(options.run !== undefined ? { runId: options.run } : {}),
            },
          )
        : runTraceChecks(
            { read },
            {
              rules: built.rules,
              select: built.select,
              ...(options.run !== undefined ? { runId: options.run } : {}),
            },
          );
      result = mergeSafetyExtensions(base, read, {
        ...(options.guardrails ? { guardrails: options.guardrails } : {}),
        ...(options.circuit ? { circuits: options.circuit } : {}),
        ...(options.run !== undefined ? { runId: options.run } : {}),
      });
    }
  } catch (error) {
    if (phase === "config") {
      if (error instanceof CheckConfigError) {
        result = errorResult(error.code, error.message);
      } else {
        const message = error instanceof Error ? error.message : String(error);
        const code: TraceCheckDiagnosticCode =
          message.startsWith("--") || message.includes("Unknown --preset")
            ? "AI_CHECK_INVALID_ARGUMENTS"
            : error instanceof SyntaxError ||
                message.includes("Unsupported check config extension") ||
                message.includes("TypeScript check configs") ||
                message.includes("Config must") ||
                message.includes("checks config") ||
                message.includes("Expected an array")
              ? "AI_CHECK_INVALID_CONFIG"
              : "AI_CHECK_CONFIG_LOAD_FAILED";
        result = errorResult(code, message);
      }
    } else {
      result = readErrorResult(error);
    }
  }

  process.exitCode = exitCodeFor(result);

  const failed = result.status !== "pass";
  if (shouldEmitEvidence(options.evidenceOn, failed)) {
    try {
      const runIds =
        evidenceRunIds.length > 0
          ? evidenceRunIds
          : result.runId !== undefined
            ? [result.runId]
            : ["check"];
      if (
        evidenceSourceContents === undefined &&
        evidenceRead !== undefined
      ) {
        evidenceSourceContents = new Map(
          runIds.map((runId) => [
            runId,
            `${evidenceRead!.events
              .filter((event) => event.runId === runId)
              .map((event) => JSON.stringify(event))
              .join("\n")}\n`,
          ]),
        );
      }
      let redactionProfile = parseEvidenceProfile(options.evidenceProfile);
      let evidenceFormat = parseEvidenceFormat(options.evidenceFormat);
      const outputDir = resolveEvidenceOutputDir(
        options.evidenceDir,
        runIds[0] ?? "check",
      );
      const written = await writeLocalEvidence({
        outputDir,
        runIds,
        ...(evidenceSourceContents !== undefined
          ? { sourceContents: evidenceSourceContents }
          : {}),
        ...(options.dir !== undefined ? { dir: options.dir } : {}),
        failed,
        checkResultsJson: checkResultToEvidenceJson(result, runIds),
        summaryText: `Check status: ${result.status}`,
        redactionProfile,
        format: evidenceFormat,
        ...(evidenceContract !== undefined
          ? {
              contractPackage: {
                engineVersion: "",
                source: "file" as const,
                contract: evidenceContract,
                ...(options.config !== undefined ? { path: options.config } : {}),
              },
            }
          : {}),
      });
      if (!options.json) {
        console.log(`Evidence: ${written}`);
      }
    } catch (error) {
      console.error(
        `[AgentInspect] evidence package skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (options.json) printJson(result);
  else printHuman(result, options);
}
