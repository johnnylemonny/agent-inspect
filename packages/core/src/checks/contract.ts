import type {
  TraceCheckEvidence,
  TraceCheckFinding,
  TraceCheckInput,
  TraceCheckResult,
  TraceCheckRule,
} from "./index.js";
import {
  createLlmUsageRule,
  createObservedOutcomeRule,
  createRunDurationRule,
  createRunStatusRule,
  createStepOrderingRule,
  createStructureIncompleteRule,
  createToolOrderingRule,
  createToolUsageRule,
  runTraceChecks,
} from "./index.js";
import {
  resolveTraceContractScope,
  type TraceContractScope,
} from "./contract-scope.js";
import { resolveCanonicalToolName } from "./logical-events.js";
import {
  evaluateControlRules,
  type TraceContractControlRules,
} from "./control-rules.js";
import { evaluateRecoveryOperations } from "./recovery-operations.js";
import {
  evaluateRetrySafetyRules,
  type TraceContractRetryRules,
} from "./retry-safety.js";
import {
  evaluateToolArgumentValue,
  extractToolArgumentPayload,
  type ToolArgumentCheck,
} from "./tool-arguments.js";
import {
  OBSERVED_OUTCOME_METHODS,
  extractOutcomesFromPersistedEvents,
  type ObservedOutcome,
} from "../outcomes/index.js";
import { formatProgrammaticDiagnostic } from "../diagnostics/programmatic.js";
import type { TraceReadResult } from "../readers/index.js";

export type { TraceContractScope } from "./contract-scope.js";
export { resolveTraceContractScope, workflowMetadataForRun } from "./contract-scope.js";
export type {
  ControlStage,
  TraceContractControlRules,
} from "./control-rules.js";
export type {
  RecoverySameArgumentsMode,
  RecoverySideEffectClass,
  TraceContractRecoveryOperation,
  TraceContractRecoveryRetryableErrors,
  TraceContractRecoverySuccessfulResultDependency,
  TraceContractRetryRules,
} from "./retry-safety.js";
export type {
  ToolArgumentCheck,
  ToolArgumentOccurrence,
  ToolArgumentOperator,
} from "./tool-arguments.js";
export {
  evaluateToolArgumentValue,
  extractToolArgumentPayload,
  resolveJsonPointer,
} from "./tool-arguments.js";

function contractFailFinding(
  ruleId: string,
  message: string,
  evidence: readonly TraceCheckEvidence[],
  expected?: unknown,
  actual?: unknown,
): TraceCheckFinding {
  return {
    ruleId,
    severity: "error",
    status: "fail",
    message,
    ...(expected !== undefined ? { expected } : {}),
    ...(actual !== undefined ? { actual } : {}),
    evidence: [...evidence],
  };
}

/**
 * @experimental Typed trace contract input. Evolves during v6.5.x.
 */
export interface TraceContractRunRules {
  requireCompleted?: boolean;
  allowedStatuses?: string[];
  maxDurationMs?: number;
}

export interface TraceContractToolRules {
  /**
   * Unconditional tool presence invariant. Every named tool must appear at least
   * once. Do not use for cache-hit or alternate-path shortcuts — prefer
   * `alternatives.anyOf` or `observations.required` when a legitimate path may
   * skip the tool.
   *
   * @see docs/TRACE-CONTRACTS.md
   */
  required?: string[];
  /** Alias of `required` (TraceContract v2 normalization). */
  requiredTools?: string[];
  forbidden?: string[];
  /** Alias of `forbidden`. */
  forbiddenTools?: string[];
  allowed?: string[];
  maxCalls?: number;
  /**
   * Required tool order expanded into adjacent pairs.
   *
   * `[A, B, C]` expands to “A before B” and “B before C”, each comparing the
   * selected `requiredOrderMode` to every pair. Unlisted intermediate tools
   * are allowed.
   *
   * TraceContract `requiredOrder` **implies presence**: every listed name is
   * added to the effective required-tool set. Low-level `createToolOrderingRule`
   * alone may still pass vacuously when an endpoint is missing.
   *
   * The default `first-occurrence` mode preserves first-occurrence encounter
   * ordering; overlapping intervals emit a non-failing warning. `happens-before`
   * requires the first before event to finish before the first after event starts.
   * `all-occurrences` applies that causal boundary to every occurrence.
   *
   * @see docs/TRACE-CONTRACTS.md
   * @beta Available through `agent-inspect/checks`. Additive changes may ship
   * in minor releases; breaking changes require a future major.
   */
  requiredOrder?: string[];
  /**
   * Ordering semantics applied to every adjacent pair in `requiredOrder`.
   * Causal modes fail closed when a required interval boundary is unavailable.
   *
   * @defaultValue `"first-occurrence"`
   * @beta Available through `agent-inspect/checks`.
   */
  requiredOrderMode?: "first-occurrence" | "happens-before" | "all-occurrences";
  /**
   * Bounded structured tool-argument checks (JSON Pointer + limited operators).
   *
   * Missing structured evidence fails closed as unevaluable (not pass).
   * Findings never embed full actual inputs.
   *
   * @experimental Additive in 6.23.
   */
  arguments?: ToolArgumentCheck[];
  /**
   * Default occurrence mode for `orderRules` when a rule omits `occurrenceMode`.
   *
   * @experimental Additive in 6.23.
   */
  defaultOccurrenceMode?: "first-occurrence" | "happens-before" | "all-occurrences";
  /**
   * Mixed per-pair ordering rules (additive alongside `requiredOrder`).
   *
   * @experimental Additive in 6.23.
   */
  orderRules?: Array<{
    before: string;
    after: string;
    occurrenceMode?: "first-occurrence" | "happens-before" | "all-occurrences";
    requireEndpoints?: boolean;
  }>;
}

export interface TraceContractLlmRules {
  maxCalls?: number;
  maxTotalTokens?: number;
  allowedModels?: string[];
}

/**
 * Explicit TOOL or LLM step endpoint for typed cross-kind ordering.
 *
 * @experimental Additive in 6.31.
 */
export type TraceContractStepKind = "TOOL" | "LLM";

/**
 * Named step endpoint with an explicit event kind.
 *
 * @experimental Additive in 6.31.
 */
export interface TraceContractStepRef {
  kind: TraceContractStepKind;
  name: string;
}

/**
 * One typed before/after ordering relation across TOOL and/or LLM steps.
 *
 * Unlike `tools.requiredOrder` / `orderRules`, endpoints are kind-qualified so
 * an LLM named `generate_answer` does not satisfy a TOOL endpoint (and vice versa).
 *
 * @experimental Additive in 6.31.
 */
export interface TraceContractStepOrderRelation {
  before: TraceContractStepRef;
  after: TraceContractStepRef;
  /**
   * Ordering semantics for this pair.
   *
   * @defaultValue `"first-occurrence"`
   */
  mode?: "first-occurrence" | "happens-before" | "all-occurrences";
  /**
   * When true (default), missing endpoints of the declared kind fail.
   * Wrong-kind same-name events do not satisfy the endpoint.
   *
   * @defaultValue `true`
   */
  requireEndpoints?: boolean;
}

/**
 * Cross-kind step ordering (TOOL ↔ LLM). Does not change TOOL-only
 * `tools.requiredOrder` / `orderRules` semantics.
 *
 * @experimental Additive in 6.31.
 */
export interface TraceContractStepRules {
  orderRelations?: TraceContractStepOrderRelation[];
}

/**
 * Structural provenance requirements for named observed outcomes (#321).
 *
 * These checks prove method/evidence linkage was recorded. They do **not**
 * prove the claim is semantically true, authorized, complete, or externally
 * trusted.
 *
 * @experimental
 */
export interface TraceContractObservationProvenance {
  /** Require a non-empty method from the bounded ObservedOutcomeMethod vocabulary. */
  method?: boolean;
  /**
   * Require bounded evidence references. Supported shapes:
   * `string` event id, `{ eventId }`, or `{ eventIds: string[] }` (max 16 ids).
   */
  evidence?: boolean;
  /** When true with evidence, each referenced event id must exist in the same run. */
  sameRunEventReference?: boolean;
}

export interface TraceContractObservationRules {
  required?: string[];
  failOn?: Array<"failed" | "unknown" | "skipped">;
  /**
   * Structural provenance gates for `required` observation names.
   *
   * @experimental
   */
  requireProvenance?: TraceContractObservationProvenance;
}

/**
 * One deterministic alternate path. Branch contracts are one level only —
 * nested `alternatives` are rejected.
 *
 * @experimental
 */
export interface TraceContractAlternativeBranch {
  /** Unique branch id within `alternatives.anyOf`. */
  id: string;
  description?: string;
  /** Branch body: run/tools/llm/observations only (no nested alternatives). */
  contract: TraceContractBody;
}

/**
 * Bounded alternative valid paths for legitimate shortcuts (GitHub #309).
 *
 * @experimental
 */
export interface TraceContractAlternatives {
  /**
   * One level of named branches. The overall contract passes when the base
   * rules pass and **at least one** complete branch passes.
   */
  anyOf: TraceContractAlternativeBranch[];
}

/** Contract body without alternatives (base or branch). */
export type TraceContractBody = {
  run?: TraceContractRunRules;
  tools?: TraceContractToolRules;
  llm?: TraceContractLlmRules;
  /**
   * Typed cross-kind step ordering (TOOL / LLM endpoints).
   *
   * @experimental Additive in 6.31.
   */
  steps?: TraceContractStepRules;
  observations?: TraceContractObservationRules;
  /**
   * Declared-versus-enforced control invariants.
   *
   * @experimental Additive in 6.23.
   */
  controls?: TraceContractControlRules;
  /**
   * Retry / side-effect safety using explicit attempt identity.
   * Additive `retry.operations[]` recovery oracles land in 6.27.
   *
   * @experimental Additive in 6.23; operations in 6.27.
   */
  retry?: TraceContractRetryRules;
};

export interface TraceContractInput extends TraceContractBody {
  /**
   * Optional actor/run projection applied before evaluation (#320).
   *
   * @experimental
   */
  scope?: TraceContractScope;
  alternatives?: TraceContractAlternatives;
}

export interface TraceContract extends TraceContractBody {
  /**
   * Optional actor/run projection applied before evaluation (#320).
   *
   * @experimental
   */
  scope?: TraceContractScope;
  alternatives?: TraceContractAlternatives;
}

/**
 * Lint diagnostic for brittle or invalid TraceContract shapes.
 *
 * @experimental
 */
export interface TraceContractLintDiagnostic {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  path?: string;
}

const ALLOWED_STATUS_ALIASES: Record<string, "ok" | "error" | "running"> = {
  ok: "ok",
  error: "error",
  running: "running",
  success: "ok",
  failed: "error",
};

/**
 * Map a contract `allowedStatuses` entry to a canonical run status.
 * Unknown values (including typos like `succes`) return `undefined` — they must
 * never silently normalize to permissive `error`.
 */
export function parseAllowedStatus(status: string): "ok" | "error" | "running" | undefined {
  return ALLOWED_STATUS_ALIASES[status];
}

function normalizeStatus(status: string): "ok" | "error" | "running" {
  const parsed = parseAllowedStatus(status);
  if (parsed === undefined) {
    throw new TypeError(
      `Unknown run status ${JSON.stringify(status)}. Allowed: ok, error, running (aliases: success, failed).`,
    );
  }
  return parsed;
}

function validateAllowedStatusesShape(
  allowedStatuses: string[] | undefined,
  pathPrefix = "run.allowedStatuses",
): TraceContractLintDiagnostic[] {
  if (!allowedStatuses?.length) return [];
  const out: TraceContractLintDiagnostic[] = [];
  for (let i = 0; i < allowedStatuses.length; i++) {
    const status = allowedStatuses[i]!;
    if (parseAllowedStatus(status) === undefined) {
      out.push({
        code: "contract.run.allowedStatuses.unknown",
        severity: "error",
        message: `${pathPrefix}[${i}] has unknown status ${JSON.stringify(status)}. Allowed: ok, error, running (aliases: success, failed).`,
        path: `${pathPrefix}[${i}]`,
      });
    }
  }
  return out;
}

function cloneBody(body: TraceContractBody): TraceContractBody {
  return {
    ...(body.run ? { run: { ...body.run } } : {}),
    ...(body.tools
      ? {
          tools: {
            ...body.tools,
            ...(body.tools.arguments ? { arguments: body.tools.arguments.map((item) => ({ ...item })) } : {}),
            ...(body.tools.orderRules
              ? { orderRules: body.tools.orderRules.map((item) => ({ ...item })) }
              : {}),
          },
        }
      : {}),
    ...(body.llm ? { llm: { ...body.llm } } : {}),
    ...(body.steps
      ? {
          steps: {
            ...(body.steps.orderRelations
              ? {
                  orderRelations: body.steps.orderRelations.map((item) => ({
                    ...item,
                    before: { ...item.before },
                    after: { ...item.after },
                  })),
                }
              : {}),
          },
        }
      : {}),
    ...(body.observations
      ? {
          observations: {
            ...body.observations,
            ...(body.observations.requireProvenance
              ? { requireProvenance: { ...body.observations.requireProvenance } }
              : {}),
          },
        }
      : {}),
    ...(body.controls
      ? {
          controls: {
            ...body.controls,
            ...(body.controls.declaredTools
              ? { declaredTools: [...body.controls.declaredTools] }
              : {}),
            ...(body.controls.enforcedTools
              ? { enforcedTools: [...body.controls.enforcedTools] }
              : {}),
            ...(body.controls.requiredStages
              ? { requiredStages: body.controls.requiredStages.map((item) => ({ ...item })) }
              : {}),
          },
        }
      : {}),
    ...(body.retry
      ? {
          retry: {
            ...body.retry,
            ...(body.retry.nonIdempotentTools
              ? { nonIdempotentTools: [...body.retry.nonIdempotentTools] }
              : {}),
            ...(body.retry.operations
              ? {
                  operations: body.retry.operations.map((operation) => ({
                    ...operation,
                    ...(operation.retryableErrors
                      ? {
                          retryableErrors: {
                            ...operation.retryableErrors,
                            ...(operation.retryableErrors.codes
                              ? { codes: [...operation.retryableErrors.codes] }
                              : {}),
                          },
                        }
                      : {}),
                    ...(operation.successfulResultDependency
                      ? {
                          successfulResultDependency: {
                            ...operation.successfulResultDependency,
                          },
                        }
                      : {}),
                  })),
                }
              : {}),
          },
        }
      : {}),
  };
}

function bodyHasRules(body: TraceContractBody): boolean {
  return (
    body.run !== undefined ||
    body.tools !== undefined ||
    body.llm !== undefined ||
    body.steps !== undefined ||
    body.observations !== undefined ||
    body.controls !== undefined ||
    body.retry !== undefined
  );
}

const MAX_EVIDENCE_EVENT_IDS = 16;
const METHOD_VOCABULARY = new Set<string>(OBSERVED_OUTCOME_METHODS);

type EvidenceRefParse =
  | { status: "missing" }
  | { status: "invalid"; reason: string }
  | { status: "ok"; eventIds: string[] };

function parseEvidenceEventIds(evidence: unknown): EvidenceRefParse {
  if (evidence === undefined || evidence === null) {
    return { status: "missing" };
  }
  if (typeof evidence === "string") {
    const trimmed = evidence.trim();
    if (trimmed === "") {
      return { status: "invalid", reason: "empty evidence string" };
    }
    return { status: "ok", eventIds: [trimmed] };
  }
  if (typeof evidence !== "object" || Array.isArray(evidence)) {
    return {
      status: "invalid",
      reason: "evidence must be a string event id or { eventId } / { eventIds }",
    };
  }
  const record = evidence as Record<string, unknown>;
  if (typeof record.eventId === "string") {
    const trimmed = record.eventId.trim();
    if (trimmed === "") {
      return { status: "invalid", reason: "empty evidence.eventId" };
    }
    return { status: "ok", eventIds: [trimmed] };
  }
  if (Array.isArray(record.eventIds)) {
    if (record.eventIds.length === 0) {
      return { status: "invalid", reason: "empty evidence.eventIds" };
    }
    if (record.eventIds.length > MAX_EVIDENCE_EVENT_IDS) {
      return {
        status: "invalid",
        reason: `evidence.eventIds exceeds bound of ${MAX_EVIDENCE_EVENT_IDS}`,
      };
    }
    const eventIds: string[] = [];
    for (const item of record.eventIds) {
      if (typeof item !== "string" || item.trim() === "") {
        return { status: "invalid", reason: "evidence.eventIds contains a non-string id" };
      }
      eventIds.push(item.trim());
    }
    return { status: "ok", eventIds };
  }
  return {
    status: "invalid",
    reason: "evidence must include eventId or eventIds",
  };
}

function provenanceFindingsForOutcome(
  outcome: ObservedOutcome,
  requireProvenance: TraceContractObservationProvenance,
  knownEventIds: ReadonlySet<string>,
): TraceCheckFinding[] {
  const findings: TraceCheckFinding[] = [];
  const evidenceBase: TraceCheckEvidence[] = [
    {
      runId: outcome.runId,
      eventId: outcome.outcomeId,
      kind: "OUTCOME",
      name: outcome.name,
      path: `outcome.${outcome.name}`,
    },
  ];

  if (requireProvenance.method) {
    if (outcome.method === undefined || outcome.method.trim() === "") {
      findings.push(
        contractFailFinding(
          "contract.observation.provenance.method",
          `Observation ${outcome.name} is missing a structural method.`,
          evidenceBase,
          { method: true },
          { name: outcome.name, method: outcome.method ?? null },
        ),
      );
    } else if (!METHOD_VOCABULARY.has(outcome.method)) {
      findings.push(
        contractFailFinding(
          "contract.observation.provenance.method",
          `Observation ${outcome.name} method ${outcome.method} is outside the bounded ObservedOutcomeMethod vocabulary.`,
          evidenceBase,
          { methodVocabulary: [...OBSERVED_OUTCOME_METHODS] },
          { name: outcome.name, method: outcome.method },
        ),
      );
    }
  }

  if (requireProvenance.evidence || requireProvenance.sameRunEventReference) {
    const parsed = parseEvidenceEventIds(outcome.evidence);
    if (parsed.status === "missing") {
      findings.push(
        contractFailFinding(
          "contract.observation.provenance.evidence",
          `Observation ${outcome.name} is missing bounded evidence references.`,
          evidenceBase,
          { evidence: true },
          { name: outcome.name, evidence: null },
        ),
      );
    } else if (parsed.status === "invalid") {
      findings.push(
        contractFailFinding(
          "contract.observation.provenance.evidence",
          `Observation ${outcome.name} evidence is not a bounded event reference (${parsed.reason}).`,
          evidenceBase,
          { evidence: true },
          { name: outcome.name, reason: parsed.reason },
        ),
      );
    } else if (requireProvenance.sameRunEventReference) {
      const missing = parsed.eventIds.filter((eventId) => !knownEventIds.has(eventId));
      if (missing.length > 0) {
        findings.push(
          contractFailFinding(
            "contract.observation.provenance.same-run",
            `Observation ${outcome.name} references event ids missing from the same run: ${missing.join(", ")}.`,
            evidenceBase,
            { sameRunEventReference: true, eventIds: parsed.eventIds },
            { name: outcome.name, missing },
          ),
        );
      }
    }
  }

  return findings;
}

function contractToRules(contract: TraceContractBody): TraceCheckRule[] {
  const rules: TraceCheckRule[] = [];

  const allowedStatuses = contract.run?.allowedStatuses ?? [];
  if (allowedStatuses.length === 1) {
    rules.push(
      createRunStatusRule({
        expected: normalizeStatus(allowedStatuses[0]!),
        allowIncomplete: contract.run?.requireCompleted === false,
      }),
    );
  } else if (allowedStatuses.length > 1) {
    const expected = [...new Set(allowedStatuses.map(normalizeStatus))];
    const allowIncomplete = contract.run?.requireCompleted === false;
    rules.push({
      id: "contract.run.allowedStatuses",
      category: "run",
      defaultSeverity: "error",
      evaluate(context) {
        const findings: TraceCheckFinding[] = [];
        const actual = context.selectedRun?.status ?? "unknown";
        if (!expected.includes(actual as "ok" | "error" | "running")) {
          findings.push(
            contractFailFinding(
              "contract.run.allowedStatuses",
              `Run status ${actual} is not one of the allowed statuses: ${expected.join(", ")}.`,
              context.selectedRun
                ? [
                    {
                      runId: context.selectedRun.runId,
                      kind: "RUN",
                      name: context.selectedRun.name,
                      status: context.selectedRun.status,
                    },
                  ]
                : [],
              expected,
              actual,
            ),
          );
        }
        if (!allowIncomplete) {
          const running = (context.logicalEvents ?? context.events).filter(
            (event) => event.status === "running",
          );
          if (running.length > 0) {
            findings.push(
              contractFailFinding(
                "contract.run.allowedStatuses",
                "Run contains incomplete running events.",
                running.map((event) => ({
                  runId: event.runId,
                  eventId: event.eventId,
                  kind: event.kind,
                  name: event.name,
                  status: event.status,
                })),
                "no running events",
                running.length,
              ),
            );
          }
        }
        return findings;
      },
    });
  } else if (contract.run?.requireCompleted !== false) {
    rules.push(createRunStatusRule({ allowIncomplete: false }));
  }

  if (contract.run?.maxDurationMs !== undefined) {
    rules.push(createRunDurationRule({ maxDurationMs: contract.run.maxDurationMs }));
  }

  if (contract.run?.requireCompleted === true) {
    rules.push(createStructureIncompleteRule({ requireEndedAtForStarted: true }));
  }

  if (contract.tools) {
    const order = contract.tools.requiredOrder ?? [];
    const requiredOrderMode = contract.tools.requiredOrderMode ?? "first-occurrence";
    const orderRules = contract.tools.orderRules ?? [];
    const endpointRequired = orderRules
      .filter((rule) => rule.requireEndpoints !== false)
      .flatMap((rule) => [rule.before, rule.after]);
    const required = [
      ...new Set([
        ...(contract.tools.required ?? []),
        ...(contract.tools.requiredTools ?? []),
        ...order,
        ...endpointRequired,
      ]),
    ];
    const forbidden = [
      ...(contract.tools.forbidden ?? []),
      ...(contract.tools.forbiddenTools ?? []),
    ];
    rules.push(
      createToolUsageRule({
        ...(required.length > 0 ? { required } : {}),
        ...(forbidden.length > 0 ? { forbidden } : {}),
        ...(contract.tools.allowed ? { allowed: contract.tools.allowed } : {}),
        ...(contract.tools.maxCalls !== undefined ? { maxCount: contract.tools.maxCalls } : {}),
      }),
    );
    for (let i = 0; i < order.length - 1; i += 1) {
      rules.push(
        createToolOrderingRule({
          before: order[i]!,
          after: order[i + 1]!,
          id: `contract.tool.order.${i}`,
          mode: requiredOrderMode,
        }),
      );
    }
    const defaultOccurrenceMode =
      contract.tools.defaultOccurrenceMode ?? requiredOrderMode;
    for (const [index, rule] of orderRules.entries()) {
      rules.push(
        createToolOrderingRule({
          before: rule.before,
          after: rule.after,
          id: `contract.tool.orderRule.${index}`,
          mode: rule.occurrenceMode ?? defaultOccurrenceMode,
        }),
      );
    }
    const argumentChecks = contract.tools.arguments ?? [];
    if (argumentChecks.length > 0) {
      rules.push({
        id: "contract.tool.arguments",
        category: "tool",
        defaultSeverity: "error",
        evaluate(context) {
          const tools = (context.logicalEvents ?? context.events).filter(
            (event) => event.kind === "TOOL" && event.status !== "running",
          );
          const findings: TraceCheckFinding[] = [];
          for (const [index, check] of argumentChecks.entries()) {
            const matches = tools.filter(
              (event) => resolveCanonicalToolName(event) === check.tool,
            );
            if (matches.length === 0) {
              findings.push(
                contractFailFinding(
                  `contract.tool.arguments.${index}`,
                  `No finished tool named ${check.tool} for argument check.`,
                  context.selectedRun
                    ? [
                        {
                          runId: context.selectedRun.runId,
                          kind: "RUN",
                          name: context.selectedRun.name,
                        },
                      ]
                    : [],
                  { tool: check.tool, path: check.path },
                  { toolCount: 0 },
                ),
              );
              continue;
            }
            const occurrence = check.occurrence ?? "all";
            const selected =
              occurrence === "first"
                ? [matches[0]!]
                : occurrence === "last"
                  ? [matches[matches.length - 1]!]
                  : matches;
            const results = selected.map((event) => {
              const payload = extractToolArgumentPayload(event);
              return evaluateToolArgumentValue(
                payload.value,
                check,
                payload.present,
              );
            });
            if (occurrence === "any") {
              if (results.some((result) => result.status === "pass")) continue;
              const firstFail = results.find((result) => result.status !== "pass")!;
              findings.push(
                contractFailFinding(
                  `contract.tool.arguments.${index}`,
                  firstFail.message,
                  selected.slice(0, 1).map((event) => ({
                    runId: event.runId,
                    eventId: event.eventId,
                    kind: event.kind,
                    name: event.name,
                    path: `tool.${check.tool}${check.path}`,
                  })),
                  { tool: check.tool, path: check.path, operator: check.operator },
                  { code: firstFail.code },
                ),
              );
              continue;
            }
            for (const [selIndex, result] of results.entries()) {
              if (result.status === "pass") continue;
              const event = selected[selIndex]!;
              findings.push(
                contractFailFinding(
                  `contract.tool.arguments.${index}`,
                  result.message,
                  [
                    {
                      runId: event.runId,
                      eventId: event.eventId,
                      kind: event.kind,
                      name: event.name,
                      path: `tool.${check.tool}${check.path}`,
                    },
                  ],
                  { tool: check.tool, path: check.path, operator: check.operator },
                  { code: result.code },
                ),
              );
            }
          }
          return findings;
        },
      });
    }
  }

  if (contract.llm) {
    rules.push(
      createLlmUsageRule({
        ...(contract.llm.maxCalls !== undefined ? { maxCalls: contract.llm.maxCalls } : {}),
        ...(contract.llm.maxTotalTokens !== undefined
          ? { maxTotalTokens: contract.llm.maxTotalTokens }
          : {}),
        ...(contract.llm.allowedModels ? { allowedModels: contract.llm.allowedModels } : {}),
      }),
    );
  }

  const orderRelations = contract.steps?.orderRelations ?? [];
  for (const [index, relation] of orderRelations.entries()) {
    rules.push(
      createStepOrderingRule({
        before: { kind: relation.before.kind, name: relation.before.name },
        after: { kind: relation.after.kind, name: relation.after.name },
        id: `contract.step.orderRelation.${index}`,
        mode: relation.mode ?? "first-occurrence",
        requireEndpoints: relation.requireEndpoints !== false,
      }),
    );
  }

  if (contract.observations) {
    const required = contract.observations.required ?? [];
    if (required.length > 0) {
      rules.push({
        id: "contract.observation.required",
        category: "run",
        defaultSeverity: "error",
        evaluate(context) {
          const outcomes = extractOutcomesFromPersistedEvents(context.events);
          const names = new Set(outcomes.map((item) => item.name));
          const missing = required.filter((name) => !names.has(name));
          if (missing.length === 0) return [];
          return [
            contractFailFinding(
              "contract.observation.required",
              `Required observations missing: ${missing.join(", ")}`,
              context.selectedRun
                ? [{ runId: context.selectedRun.runId, kind: "RUN", name: context.selectedRun.name }]
                : [],
              required,
              [...names],
            ),
          ];
        },
      });
    }
    if (contract.observations.failOn?.length) {
      rules.push(
        createObservedOutcomeRule({
          failOn: contract.observations.failOn.filter(
            (status): status is "failed" | "unknown" | "skipped" =>
              status === "failed" || status === "unknown" || status === "skipped",
          ),
        }),
      );
    }
    const requireProvenance = contract.observations.requireProvenance;
    if (
      requireProvenance &&
      (requireProvenance.method ||
        requireProvenance.evidence ||
        requireProvenance.sameRunEventReference)
    ) {
      rules.push({
        id: "contract.observation.provenance",
        category: "run",
        defaultSeverity: "error",
        evaluate(context) {
          const outcomes = extractOutcomesFromPersistedEvents(context.events);
          const knownEventIds = new Set(context.events.map((event) => event.eventId));
          const targets =
            required.length > 0
              ? outcomes.filter((outcome) => required.includes(outcome.name))
              : outcomes;
          return targets.flatMap((outcome) =>
            provenanceFindingsForOutcome(outcome, requireProvenance, knownEventIds),
          );
        },
      });
    }
  }

  if (contract.controls) {
    const controls = contract.controls;
    rules.push({
      id: "contract.controls",
      category: "run",
      defaultSeverity: "error",
      evaluate(context) {
        const events = context.logicalEvents ?? context.events;
        const outcomes = extractOutcomesFromPersistedEvents(context.events);
        const observationNames = new Set(outcomes.map((item) => item.name));
        const runEvidence: TraceCheckEvidence[] = context.selectedRun
          ? [
              {
                runId: context.selectedRun.runId,
                kind: "RUN",
                name: context.selectedRun.name,
              },
            ]
          : [];
        return evaluateControlRules(events, controls, runEvidence, observationNames);
      },
    });
  }

  if (contract.retry) {
    const retry = contract.retry;
    rules.push({
      id: "contract.retry",
      category: "run",
      defaultSeverity: "error",
      evaluate(context) {
        const events = context.logicalEvents ?? context.events;
        const runEvidence: TraceCheckEvidence[] = context.selectedRun
          ? [
              {
                runId: context.selectedRun.runId,
                kind: "RUN",
                name: context.selectedRun.name,
              },
            ]
          : [];
        const base = evaluateRetrySafetyRules(events, retry, runEvidence);
        if (!retry.operations || retry.operations.length === 0) {
          return base;
        }
        return [...base, ...evaluateRecoveryOperations(events, retry.operations)];
      },
    });
  }

  return rules;
}

function validateScopeShape(
  scope: TraceContractScope | undefined,
): TraceContractLintDiagnostic[] {
  if (scope === undefined) return [];
  const hasSelector =
    (typeof scope.runId === "string" && scope.runId.trim() !== "") ||
    (typeof scope.subAgentId === "string" && scope.subAgentId.trim() !== "") ||
    (typeof scope.groupId === "string" && scope.groupId.trim() !== "") ||
    (typeof scope.workflowStep === "string" && scope.workflowStep.trim() !== "") ||
    (typeof scope.rootEventId === "string" && scope.rootEventId.trim() !== "");
  if (!hasSelector) {
    return [
      {
        code: "contract.scope.empty",
        severity: "error",
        message:
          "scope requires at least one explicit selector (runId, subAgentId, groupId, workflowStep, or rootEventId).",
        path: "scope",
      },
    ];
  }
  return [];
}

function validateProvenanceShape(
  observations: TraceContractObservationRules | undefined,
): TraceContractLintDiagnostic[] {
  const diagnostics: TraceContractLintDiagnostic[] = [];
  const provenance = observations?.requireProvenance;
  if (!provenance) return diagnostics;
  const enabled =
    provenance.method === true ||
    provenance.evidence === true ||
    provenance.sameRunEventReference === true;
  if (!enabled) {
    diagnostics.push({
      code: "contract.observation.provenance.empty",
      severity: "warning",
      message: "observations.requireProvenance is set but no flags are enabled.",
      path: "observations.requireProvenance",
    });
  }
  if (provenance.sameRunEventReference === true && provenance.evidence !== true) {
    diagnostics.push({
      code: "contract.observation.provenance.same-run-without-evidence",
      severity: "info",
      message:
        "sameRunEventReference implies evidence checking; set requireProvenance.evidence: true for clarity.",
      path: "observations.requireProvenance.sameRunEventReference",
    });
  }
  if (enabled && (observations?.required?.length ?? 0) === 0) {
    diagnostics.push({
      code: "contract.observation.provenance.without-required",
      severity: "warning",
      message:
        "requireProvenance without observations.required applies to every observed outcome in scope.",
      path: "observations.requireProvenance",
    });
  }
  return diagnostics;
}

function validateAlternativesShape(
  alternatives: TraceContractAlternatives | undefined,
): TraceContractLintDiagnostic[] {
  const diagnostics: TraceContractLintDiagnostic[] = [];
  if (alternatives === undefined) return diagnostics;
  const branches = alternatives.anyOf ?? [];
  if (branches.length === 0) {
    diagnostics.push({
      code: "contract.alternatives.empty",
      severity: "error",
      message: "alternatives.anyOf must contain at least one branch.",
      path: "alternatives.anyOf",
    });
    return diagnostics;
  }
  const seen = new Set<string>();
  for (const [index, branch] of branches.entries()) {
    const path = `alternatives.anyOf[${index}]`;
    if (!branch?.id || branch.id.trim() === "") {
      diagnostics.push({
        code: "contract.alternatives.missing-id",
        severity: "error",
        message: "Each alternatives.anyOf branch requires a non-empty id.",
        path,
      });
      continue;
    }
    if (seen.has(branch.id)) {
      diagnostics.push({
        code: "contract.alternatives.duplicate-id",
        severity: "error",
        message: `Duplicate alternatives.anyOf branch id: ${branch.id}`,
        path: `${path}.id`,
      });
    }
    seen.add(branch.id);
    if (!bodyHasRules(branch.contract ?? {})) {
      diagnostics.push({
        code: "contract.alternatives.empty-branch",
        severity: "error",
        message: `Branch ${branch.id} must declare at least one run/tools/llm/observations/controls/retry rule.`,
        path: `${path}.contract`,
      });
    }
    const nested = (branch.contract as TraceContractBody & { alternatives?: unknown })
      ?.alternatives;
    if (nested !== undefined) {
      diagnostics.push({
        code: "contract.alternatives.nested",
        severity: "error",
        message:
          "Nested alternatives.anyOf is not supported. Keep one alternatives level only.",
        path: `${path}.contract.alternatives`,
      });
    }
  }
  return diagnostics;
}

function emptyPassResult(input: TraceCheckInput, runId?: string): TraceCheckResult {
  return {
    ok: true,
    status: "pass",
    format: input.read.format,
    ...(runId !== undefined ? { runId } : {}),
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
}

function mergeContractResults(
  input: TraceCheckInput,
  parts: readonly TraceCheckResult[],
  extraFindings: readonly TraceCheckFinding[] = [],
): TraceCheckResult {
  const findings = [...parts.flatMap((part) => part.findings), ...extraFindings];
  const diagnostics = parts.flatMap((part) => part.diagnostics);
  const ruleExecutions = parts.flatMap((part) => part.ruleExecutions);
  const failed = findings.filter(
    (finding) => finding.status === "fail" && finding.severity === "error",
  ).length;
  const errors = diagnostics.filter((item) => item.severity === "error").length;
  const status: TraceCheckResult["status"] =
    errors > 0 ? "error" : failed > 0 ? "fail" : "pass";
  const runId = parts.find((part) => part.runId !== undefined)?.runId;
  return {
    ok: status === "pass",
    status,
    format: input.read.format,
    ...(runId !== undefined ? { runId } : {}),
    summary: {
      passed: findings.filter((finding) => finding.status === "pass").length,
      failed,
      warnings: findings.filter(
        (finding) => finding.status === "warning" || finding.severity === "warning",
      ).length,
      errors,
      rulesEvaluated: ruleExecutions.length,
      rulesPassed: ruleExecutions.filter((item) => item.status === "pass").length,
      rulesWarning: ruleExecutions.filter((item) => item.status === "warning").length,
      rulesFailed: ruleExecutions.filter((item) => item.status === "fail").length,
      rulesError: ruleExecutions.filter((item) => item.status === "error").length,
    },
    findings,
    diagnostics,
    ruleExecutions,
  };
}

function evaluateBody(
  input: TraceCheckInput,
  body: TraceContractBody,
  options: { runId?: string } = {},
): TraceCheckResult {
  const rules = contractToRules(body);
  if (rules.length === 0) {
    return emptyPassResult(input, options.runId);
  }
  return runTraceChecks(input, {
    rules,
    ...(options.runId !== undefined ? { runId: options.runId } : {}),
  });
}

/**
 * Define a normalized trace contract object.
 *
 * @experimental
 */
export function defineTraceContract(input: TraceContractInput): TraceContract {
  const shapeErrors = [
    ...validateAllowedStatusesShape(input.run?.allowedStatuses),
    ...validateAlternativesShape(input.alternatives),
    ...validateScopeShape(input.scope),
    ...validateProvenanceShape(input.observations),
  ].filter((item) => item.severity === "error");
  if (shapeErrors.length > 0) {
    throw new TypeError(shapeErrors.map((item) => item.message).join(" "));
  }
  const body = cloneBody(input);
  const alternatives = input.alternatives
    ? {
        anyOf: input.alternatives.anyOf.map((branch) => ({
          id: branch.id,
          ...(branch.description !== undefined ? { description: branch.description } : {}),
          contract: cloneBody(branch.contract),
        })),
      }
    : undefined;
  const scope = input.scope
    ? {
        ...(input.scope.runId !== undefined ? { runId: input.scope.runId } : {}),
        ...(input.scope.subAgentId !== undefined ? { subAgentId: input.scope.subAgentId } : {}),
        ...(input.scope.groupId !== undefined ? { groupId: input.scope.groupId } : {}),
        ...(input.scope.workflowStep !== undefined
          ? { workflowStep: input.scope.workflowStep }
          : {}),
        ...(input.scope.rootEventId !== undefined
          ? { rootEventId: input.scope.rootEventId }
          : {}),
      }
    : undefined;
  return {
    ...body,
    ...(scope ? { scope } : {}),
    ...(alternatives ? { alternatives } : {}),
  };
}

function isTraceReadLike(value: unknown): value is TraceReadResult {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<TraceReadResult>;
  return (
    typeof candidate.format === "string" &&
    Array.isArray(candidate.runs) &&
    Array.isArray(candidate.events)
  );
}

function isTraceCheckInputLike(value: unknown): value is TraceCheckInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return isTraceReadLike((value as TraceCheckInput).read);
}

function looksLikeTraceContract(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  // Reject values that are clearly a read / TraceCheckInput (common reverse misuse).
  if (isTraceReadLike(value) || isTraceCheckInputLike(value)) {
    return false;
  }
  return true;
}

function invalidContractInputResult(): TraceCheckResult {
  return {
    ok: false,
    status: "error",
    format: "unknown",
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
    diagnostics: [
      {
        code: "AI_CHECK_INVALID_ARGUMENTS",
        message: formatProgrammaticDiagnostic("AI_TRACE_CONTRACT_INPUT_INVALID"),
        severity: "error",
      },
    ],
    ruleExecutions: [],
  };
}

function validateEvaluateTraceContractArgs(
  input: unknown,
  contract: unknown,
): TraceCheckResult | undefined {
  if (isTraceCheckInputLike(input) && looksLikeTraceContract(contract)) {
    return undefined;
  }
  // Common JS reverse: evaluateTraceContract(contract, { read }) or (contract, read).
  if (
    looksLikeTraceContract(input) &&
    (isTraceCheckInputLike(contract) || isTraceReadLike(contract))
  ) {
    return invalidContractInputResult();
  }
  // Bare TraceReadResult as first arg (should use evaluateTraceContractRead).
  if (isTraceReadLike(input)) {
    return invalidContractInputResult();
  }
  if (!isTraceCheckInputLike(input)) {
    return invalidContractInputResult();
  }
  if (!looksLikeTraceContract(contract)) {
    return invalidContractInputResult();
  }
  return undefined;
}

/**
 * Evaluate a trace contract against an opened trace read result.
 *
 * Base rules always apply. When `alternatives.anyOf` is present, at least one
 * complete branch must also pass.
 *
 * @experimental
 */
export function evaluateTraceContract(
  input: TraceCheckInput,
  contract: TraceContract,
  options: { runId?: string } = {},
): TraceCheckResult {
  const inputGuard = validateEvaluateTraceContractArgs(input, contract);
  if (inputGuard !== undefined) {
    return inputGuard;
  }

  const shapeErrors = [
    ...validateAllowedStatusesShape(contract.run?.allowedStatuses),
    ...validateAlternativesShape(contract.alternatives),
    ...validateScopeShape(contract.scope),
    ...validateProvenanceShape(contract.observations),
  ].filter((item) => item.severity === "error");
  if (shapeErrors.length > 0) {
    return {
      ok: false,
      status: "error",
      format: input.read.format,
      ...(options.runId !== undefined ? { runId: options.runId } : {}),
      summary: {
        passed: 0,
        failed: 0,
        warnings: 0,
        errors: shapeErrors.length,
        rulesEvaluated: 0,
        rulesPassed: 0,
        rulesWarning: 0,
        rulesFailed: 0,
        rulesError: 0,
      },
      findings: [],
      diagnostics: shapeErrors.map((item) => ({
        code: "AI_CHECK_INVALID_CONFIG",
        message: item.message,
        severity: "error" as const,
        ruleId: item.code,
      })),
      ruleExecutions: [],
    };
  }

  const scoped = resolveTraceContractScope(input, contract.scope);
  if (scoped.diagnostics.length > 0) {
    return {
      ok: false,
      status: "error",
      format: input.read.format,
      ...(options.runId !== undefined ? { runId: options.runId } : {}),
      ...(scoped.resolved?.runId !== undefined ? { runId: scoped.resolved.runId } : {}),
      summary: {
        passed: 0,
        failed: 0,
        warnings: 0,
        errors: scoped.diagnostics.length,
        rulesEvaluated: 0,
        rulesPassed: 0,
        rulesWarning: 0,
        rulesFailed: 0,
        rulesError: 0,
      },
      findings: [],
      diagnostics: scoped.diagnostics,
      ruleExecutions: [],
    };
  }

  const effectiveInput = scoped.resolved?.input ?? input;
  const effectiveRunId = scoped.resolved?.runId ?? options.runId;
  const base = evaluateBody(effectiveInput, contract, {
    ...(effectiveRunId !== undefined ? { runId: effectiveRunId } : {}),
  });
  const scopeFinding: TraceCheckFinding | undefined = scoped.resolved
    ? {
        ruleId: "contract.scope.selected",
        severity: "info",
        status: "pass",
        message: `Selected actor ${scoped.resolved.runId} with ${scoped.resolved.evidenceEventCount} evidence event(s).`,
        expected: scoped.resolved.matchedSelectors,
        actual: {
          runId: scoped.resolved.runId,
          evidenceEventCount: scoped.resolved.evidenceEventCount,
          ...(scoped.resolved.rootEventId !== undefined
            ? { rootEventId: scoped.resolved.rootEventId }
            : {}),
        },
        evidence: [
          {
            runId: scoped.resolved.runId,
            kind: "RUN",
            path: "scope",
          },
        ],
      }
    : undefined;

  const branches = contract.alternatives?.anyOf ?? [];
  if (branches.length === 0) {
    return scopeFinding
      ? mergeContractResults(effectiveInput, [base], [scopeFinding])
      : base;
  }

  const branchEvaluations = branches.map((branch) => {
    const result = evaluateBody(effectiveInput, branch.contract, {
      ...(effectiveRunId !== undefined ? { runId: effectiveRunId } : {}),
    });
    return { branch, result };
  });
  const satisfied = branchEvaluations
    .filter((item) => item.result.ok && item.result.status === "pass")
    .map((item) => item.branch.id);
  const failedBranches = branchEvaluations.filter(
    (item) => !(item.result.ok && item.result.status === "pass"),
  );

  if (satisfied.length > 0) {
    const passFinding: TraceCheckFinding = {
      ruleId: "contract.alternatives.anyOf",
      severity: "info",
      status: "pass",
      message: `Satisfied alternative branch(es): ${satisfied.join(", ")}.`,
      expected: { anyOf: branches.map((branch) => branch.id) },
      actual: {
        satisfied,
        failed: failedBranches.map((item) => item.branch.id),
      },
      evidence: [],
    };
    return mergeContractResults(
      effectiveInput,
      [base],
      [...(scopeFinding ? [scopeFinding] : []), passFinding],
    );
  }

  const noneFinding: TraceCheckFinding = {
    ruleId: "contract.alternatives.none-satisfied",
    severity: "error",
    status: "fail",
    message: "No alternatives.anyOf branch fully satisfied its contract.",
    expected: { anyOf: branches.map((branch) => branch.id) },
    actual: {
      branchFailures: Object.fromEntries(
        failedBranches.map((item) => [
          item.branch.id,
          item.result.findings
            .filter((finding) => finding.status === "fail")
            .map((finding) => ({
              ruleId: finding.ruleId,
              message: finding.message,
            })),
        ]),
      ),
    },
    evidence: [],
  };
  const prefixedBranchFindings = failedBranches.flatMap((item) =>
    item.result.findings
      .filter((finding) => finding.status === "fail")
      .map((finding) => ({
        ...finding,
        ruleId: `contract.alternatives.${item.branch.id}.${finding.ruleId}`,
      })),
  );
  return mergeContractResults(
    effectiveInput,
    [base],
    [...(scopeFinding ? [scopeFinding] : []), noneFinding, ...prefixedBranchFindings],
  );
}

/**
 * Convenience: evaluate a contract against a TraceReadResult directly.
 *
 * @experimental Additive wrapper over `evaluateTraceContract({ read }, …)`.
 */
export function evaluateTraceContractRead(
  read: TraceReadResult,
  contract: TraceContract,
  options: { runId?: string } = {},
): TraceCheckResult {
  if (!isTraceReadLike(read) || !looksLikeTraceContract(contract)) {
    return invalidContractInputResult();
  }
  return evaluateTraceContract({ read }, contract, options);
}

/**
 * Lint a TraceContract for invalid or brittle shapes (does not evaluate a trace).
 *
 * @experimental
 */
export function lintTraceContract(contract: TraceContract): TraceContractLintDiagnostic[] {
  const diagnostics = [
    ...validateAlternativesShape(contract.alternatives),
    ...validateScopeShape(contract.scope),
    ...validateProvenanceShape(contract.observations),
  ];
  const branches = contract.alternatives?.anyOf ?? [];
  if (branches.length === 1) {
    diagnostics.push({
      code: "contract.alternatives.single-branch",
      severity: "warning",
      message:
        "alternatives.anyOf has a single branch. Prefer base rules unless a second valid path exists.",
      path: "alternatives.anyOf",
    });
  }
  const required = [
    ...(contract.tools?.required ?? []),
    ...(contract.tools?.requiredTools ?? []),
  ];
  if (required.length > 0 && branches.length === 0) {
    diagnostics.push({
      code: "contract.brittle.unconditional-required",
      severity: "info",
      message:
        "tools.required is unconditional. Use alternatives.anyOf when a legitimate shortcut may skip a tool.",
      path: "tools.required",
    });
  }
  const order = contract.tools?.requiredOrder ?? [];
  if (order.length >= 2 && contract.tools?.requiredOrderMode === undefined) {
    diagnostics.push({
      code: "contract.brittle.first-occurrence-default",
      severity: "info",
      message:
        "requiredOrder defaults to first-occurrence. Set requiredOrderMode when repeated calls must fail.",
      path: "tools.requiredOrderMode",
    });
  }
  const orderRules = contract.tools?.orderRules ?? [];
  const seenPairs = new Set<string>();
  for (const [index, rule] of orderRules.entries()) {
    const key = `${rule.before}\0${rule.after}`;
    if (seenPairs.has(key)) {
      diagnostics.push({
        code: "contract.tools.orderRules.duplicate",
        severity: "warning",
        message: `Duplicate orderRules pair ${rule.before} → ${rule.after}.`,
        path: `tools.orderRules[${index}]`,
      });
    }
    seenPairs.add(key);
    if (rule.before === rule.after) {
      diagnostics.push({
        code: "contract.tools.orderRules.self",
        severity: "error",
        message: "orderRules before and after must differ.",
        path: `tools.orderRules[${index}]`,
      });
    }
  }
  if ((contract.tools?.arguments?.length ?? 0) > 0) {
    for (const [index, check] of (contract.tools?.arguments ?? []).entries()) {
      if (!check.path.startsWith("/") && check.path !== "") {
        diagnostics.push({
          code: "contract.tools.arguments.path",
          severity: "error",
          message: "tools.arguments path must be a JSON Pointer (\"\" or start with \"/\").",
          path: `tools.arguments[${index}].path`,
        });
      }
    }
  }
  return diagnostics;
}

/**
 * Explain a TraceContract as short human-readable lines (does not evaluate a trace).
 *
 * @experimental
 */
export function explainTraceContract(contract: TraceContract): string[] {
  const lines: string[] = [];
  if (contract.scope) {
    const parts = Object.entries(contract.scope)
      .filter(([, value]) => typeof value === "string" && value.trim() !== "")
      .map(([key, value]) => `${key}=${value}`);
    if (parts.length > 0) {
      lines.push(`Scope: select actor by [${parts.join(", ")}] before evaluation.`);
    }
  }
  if (contract.run?.requireCompleted !== false) {
    lines.push("Base: run must complete (no running events).");
  }
  if (contract.run?.allowedStatuses?.length) {
    lines.push(`Base: run status in [${contract.run.allowedStatuses.join(", ")}].`);
  }
  if (contract.run?.maxDurationMs !== undefined) {
    lines.push(`Base: run duration <= ${contract.run.maxDurationMs}ms.`);
  }
  if (contract.tools) {
    const required = [
      ...new Set([
        ...(contract.tools.required ?? []),
        ...(contract.tools.requiredTools ?? []),
        ...(contract.tools.requiredOrder ?? []),
      ]),
    ];
    if (required.length > 0) {
      lines.push(`Base: required tools [${required.join(", ")}].`);
    }
    const forbidden = [
      ...(contract.tools.forbidden ?? []),
      ...(contract.tools.forbiddenTools ?? []),
    ];
    if (forbidden.length > 0) {
      lines.push(`Base: forbidden tools [${forbidden.join(", ")}].`);
    }
    if ((contract.tools.requiredOrder?.length ?? 0) >= 2) {
      const mode = contract.tools.requiredOrderMode ?? "first-occurrence";
      lines.push(
        `Base: requiredOrder [${contract.tools.requiredOrder!.join(" → ")}] mode=${mode}.`,
      );
    }
    if ((contract.tools.orderRules?.length ?? 0) > 0) {
      const defaultMode = contract.tools.defaultOccurrenceMode ?? "first-occurrence";
      lines.push(
        `Base: ${contract.tools.orderRules!.length} orderRules (defaultOccurrenceMode=${defaultMode}).`,
      );
    }
    if ((contract.tools.arguments?.length ?? 0) > 0) {
      lines.push(
        `Base: ${contract.tools.arguments!.length} structured tool-argument check(s).`,
      );
    }
  }
  if (contract.llm) {
    if (contract.llm.maxCalls !== undefined) {
      lines.push(`Base: LLM maxCalls=${contract.llm.maxCalls}.`);
    }
    if (contract.llm.maxTotalTokens !== undefined) {
      lines.push(`Base: LLM maxTotalTokens=${contract.llm.maxTotalTokens}.`);
    }
    if (contract.llm.allowedModels?.length) {
      lines.push(`Base: LLM allowedModels [${contract.llm.allowedModels.join(", ")}].`);
    }
  }
  if ((contract.steps?.orderRelations?.length ?? 0) > 0) {
    const relations = contract.steps!.orderRelations!;
    const summary = relations
      .map(
        (relation) =>
          `${relation.before.kind}:${relation.before.name} → ${relation.after.kind}:${relation.after.name}` +
          ` mode=${relation.mode ?? "first-occurrence"}`,
      )
      .join("; ");
    lines.push(`Base: ${relations.length} steps.orderRelations [${summary}].`);
  }
  if (contract.observations?.required?.length) {
    lines.push(`Base: required observations [${contract.observations.required.join(", ")}].`);
  }
  if (contract.observations?.failOn?.length) {
    lines.push(`Base: fail on observations [${contract.observations.failOn.join(", ")}].`);
  }
  if (contract.observations?.requireProvenance) {
    const flags = [
      contract.observations.requireProvenance.method ? "method" : undefined,
      contract.observations.requireProvenance.evidence ? "evidence" : undefined,
      contract.observations.requireProvenance.sameRunEventReference
        ? "sameRunEventReference"
        : undefined,
    ].filter((item): item is string => item !== undefined);
    if (flags.length > 0) {
      lines.push(
        `Base: require structural observation provenance [${flags.join(", ")}] (not semantic truth).`,
      );
    }
  }
  if (contract.controls) {
    lines.push("Base: declared-versus-enforced control checks enabled.");
  }
  if (contract.retry) {
    const opCount = contract.retry.operations?.length ?? 0;
    lines.push(
      opCount > 0
        ? `Base: retry/side-effect safety checks enabled (${opCount} recovery operation oracle(s)).`
        : "Base: retry/side-effect safety checks enabled.",
    );
  }
  const branches = contract.alternatives?.anyOf ?? [];
  if (branches.length > 0) {
    lines.push(
      `Alternatives: at least one of [${branches.map((branch) => branch.id).join(", ")}] must fully pass.`,
    );
    for (const branch of branches) {
      const detail = branch.description ? ` — ${branch.description}` : "";
      lines.push(`  branch ${branch.id}${detail}`);
    }
  }
  if (lines.length === 0) {
    lines.push("Empty contract: no base rules and no alternatives.");
  }
  return lines;
}
