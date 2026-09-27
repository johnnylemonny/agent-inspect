import {
  DEFAULT_CIRCUIT_RULES,
  runCircuits,
  type CircuitResult,
  type CircuitRuleId,
  type CircuitTraceEvent,
  type RunCircuitsOptions,
} from "@agent-inspect/circuit";
import {
  DEFAULT_GUARDRAIL_RULES,
  runGuardrails,
  type GuardrailResult,
  type GuardrailRuleId,
  type RunGuardrailsOptions,
} from "@agent-inspect/guardrails";
import {
  projectLogicalEvents,
  type TraceCheckEvidence,
  type TraceCheckFinding,
  type TraceCheckResult,
  type TraceCheckRuleExecution,
  type TraceCheckRuleExecutionStatus,
  type TraceCheckSeverity,
} from "@agent-inspect/core/checks";
import type { TraceReadResult } from "@agent-inspect/core/readers";

type PersistedEvent = TraceReadResult["events"][number];

const GUARDRAIL_ALIASES: Record<string, GuardrailRuleId> = {
  "banned-phrase": "guardrail.banned-phrase",
  "pii-leak": "guardrail.pii-leak",
  "unsafe-tool-args": "guardrail.unsafe-tool-args",
  "prompt-injection": "guardrail.prompt-injection",
  "structured-output": "guardrail.structured-output",
  "oversize-output": "guardrail.oversize-output",
  "required-json-shape": "guardrail.required-json-shape",
};

const CIRCUIT_ALIASES: Record<string, CircuitRuleId> = {
  "same-tool-repetition": "circuit.same-tool-repetition",
  "same-args-repetition": "circuit.same-args-repetition",
  "max-loop-iterations": "circuit.max-loop-iterations",
  "max-retries": "circuit.max-retries",
  "tool-timeout": "circuit.tool-timeout",
  "runaway-llm-loop": "circuit.runaway-llm-loop",
  "excessive-branch-width": "circuit.excessive-branch-width",
};

const KNOWN_CIRCUIT_RULES = new Set<string>([
  ...Object.values(CIRCUIT_ALIASES),
  ...DEFAULT_CIRCUIT_RULES,
]);

const KNOWN_GUARDRAIL_RULES = new Set<string>([
  ...Object.values(GUARDRAIL_ALIASES),
  ...DEFAULT_GUARDRAIL_RULES,
]);

export function parseGuardrailRules(values: readonly string[] | undefined): GuardrailRuleId[] | undefined {
  if (!values?.length) return undefined;
  return values.map((value) => {
    const rule = GUARDRAIL_ALIASES[value] ?? (value as GuardrailRuleId);
    return rule;
  });
}

export function parseCircuitRules(values: readonly string[] | undefined): CircuitRuleId[] | undefined {
  if (!values?.length) return undefined;
  return values.map((value) => {
    const rule = CIRCUIT_ALIASES[value] ?? (value as CircuitRuleId);
    return rule;
  });
}

function toSeverity(severity: "error" | "warning" | "info"): TraceCheckSeverity {
  return severity;
}

function guardrailFinding(result: GuardrailResult): TraceCheckFinding {
  return {
    ruleId: result.ruleId,
    severity: toSeverity(result.severity),
    status: result.status === "pass" ? "pass" : result.status === "warn" ? "warning" : "fail",
    message: result.message,
    evidence: result.evidence.map(
      (item): TraceCheckEvidence => ({
        path: item.preview ? `${item.path ?? "value"} (${item.preview})` : item.path,
      }),
    ),
  };
}

function circuitFinding(result: CircuitResult): TraceCheckFinding {
  return {
    ruleId: result.ruleId,
    severity: toSeverity(result.severity),
    status: result.status === "closed" ? "pass" : result.status === "warn" ? "warning" : "fail",
    message: result.message,
    evidence: result.evidence.map(
      (item): TraceCheckEvidence => ({
        runId: item.runId,
        eventId: item.eventId,
        path: item.path,
        name: item.toolName,
      }),
    ),
    actual: result.evidence[0]?.count,
    expected: result.evidence[0]?.threshold,
  };
}

function eventToCircuit(event: PersistedEvent): CircuitTraceEvent {
  return {
    eventId: event.eventId,
    runId: event.runId,
    name: event.name,
    kind: event.kind,
    parentId: event.parentId,
    startedAt: event.startedAt,
    endedAt: event.endedAt,
    durationMs: event.durationMs,
    attributes: event.attributes,
    status: event.status,
  };
}

function scopedEvents(
  read: TraceReadResult,
  runId: string | undefined,
): PersistedEvent[] {
  if (runId === undefined) return [...read.events];
  return read.events.filter((event) => event.runId === runId);
}

function collectGuardrailInputs(events: readonly PersistedEvent[]): Array<{
  text?: string;
  value?: unknown;
  toolName?: string;
  toolArgs?: unknown;
}> {
  const inputs: Array<{
    text?: string;
    value?: unknown;
    toolName?: string;
    toolArgs?: unknown;
  }> = [];
  for (const event of events) {
    const attrs = event.attributes ?? {};
    for (const key of ["output", "answer", "text", "content", "message"]) {
      const value = attrs[key];
      if (typeof value === "string") inputs.push({ text: value });
      else if (value !== undefined) inputs.push({ value });
    }
    const kind = typeof event.kind === "string" ? event.kind.toLowerCase() : "";
    if (kind === "tool" || event.name.startsWith("tool:")) {
      inputs.push({
        toolName: String(attrs.toolName ?? attrs.tool ?? event.name),
        toolArgs: attrs.arguments ?? attrs.args ?? attrs.input,
      });
    }
  }
  return inputs;
}

function classifyExtensionExecution(
  findings: readonly TraceCheckFinding[],
  errored: boolean,
): TraceCheckRuleExecutionStatus {
  if (errored) return "error";
  if (findings.some((finding) => finding.status === "fail")) return "fail";
  if (findings.some((finding) => finding.status === "warning")) return "warning";
  return "pass";
}

/**
 * One selected guardrail/circuit rule → one `ruleExecutions` entry.
 * Finding counts may exceed 1 when a guardrail rule runs over multiple inputs;
 * `rulesEvaluated` still counts the selected rule once.
 */
function extensionExecution(
  ruleId: string,
  findings: readonly TraceCheckFinding[],
  options: { runId?: string; errored?: boolean },
): TraceCheckRuleExecution {
  return {
    ruleId,
    category: "safety",
    status: classifyExtensionExecution(findings, options.errored === true),
    findingCount: findings.length,
    ...(options.runId !== undefined ? { runId: options.runId } : {}),
  };
}

const DEFAULT_GUARDRAIL_OPTIONS: RunGuardrailsOptions = {
  bannedPhrase: { phrases: ["delete all data", "ignore all instructions"] },
  promptInjection: {},
  piiLeak: { profile: "share" },
};

const DEFAULT_CIRCUIT_OPTIONS: RunCircuitsOptions = {
  sameToolRepetition: { maxRepeats: 3 },
  sameArgsRepetition: { maxRepeats: 2 },
  maxLoopIterations: { maxIterations: 20 },
  maxRetries: { maxRetries: 3 },
  toolTimeout: { maxDurationMs: 60_000 },
  runawayLlmLoop: { maxLlmCalls: 12 },
  excessiveBranchWidth: { maxWidth: 8 },
};

export function mergeSafetyExtensions(
  result: TraceCheckResult,
  read: TraceReadResult,
  options: {
    guardrails?: readonly string[];
    circuits?: readonly string[];
    /** When set, only this run's events feed extensions (matches --run / session per-run). */
    runId?: string;
  },
): TraceCheckResult {
  const findings = [...result.findings];
  const ruleExecutions = [...(result.ruleExecutions ?? [])];
  let failed = result.summary.failed;
  let warnings = result.summary.warnings;
  let passed = result.summary.passed;
  let errors = result.summary.errors;

  const events = scopedEvents(read, options.runId);
  const runId = options.runId;

  const guardrailRules = parseGuardrailRules(options.guardrails);
  if (guardrailRules) {
    const inputs = collectGuardrailInputs(events);
    for (const ruleId of guardrailRules) {
      if (!KNOWN_GUARDRAIL_RULES.has(ruleId)) {
        const finding: TraceCheckFinding = {
          ruleId,
          severity: "error",
          status: "fail",
          message: `Unknown guardrail rule: ${ruleId}.`,
          evidence: [],
        };
        findings.push(finding);
        failed += 1;
        ruleExecutions.push(extensionExecution(ruleId, [finding], { runId, errored: true }));
        errors += 1;
        continue;
      }

      const ruleFindings: TraceCheckFinding[] = [];
      // No applicable input: still record that the selected rule was evaluated.
      if (inputs.length === 0) {
        ruleExecutions.push(extensionExecution(ruleId, [], { runId }));
        continue;
      }

      for (const input of inputs) {
        const run = runGuardrails(input, {
          ...DEFAULT_GUARDRAIL_OPTIONS,
          rules: [ruleId],
        });
        for (const item of run.results) {
          const finding = guardrailFinding(item);
          ruleFindings.push(finding);
          findings.push(finding);
          if (finding.status === "fail") failed += 1;
          else if (finding.status === "warning") warnings += 1;
          else passed += 1;
        }
      }
      ruleExecutions.push(extensionExecution(ruleId, ruleFindings, { runId }));
    }
  }

  const circuitRules = parseCircuitRules(options.circuits);
  if (circuitRules) {
    const projected = projectLogicalEvents(events);
    const circuitEvents = projected.logicalEvents.map(eventToCircuit);

    for (const ruleId of circuitRules) {
      if (!KNOWN_CIRCUIT_RULES.has(ruleId)) {
        const finding: TraceCheckFinding = {
          ruleId,
          severity: "error",
          status: "fail",
          message: `Unknown circuit rule: ${ruleId}.`,
          evidence: [],
        };
        findings.push(finding);
        failed += 1;
        errors += 1;
        ruleExecutions.push(extensionExecution(ruleId, [finding], { runId, errored: true }));
        continue;
      }

      const circuitRun = runCircuits(circuitEvents, {
        ...DEFAULT_CIRCUIT_OPTIONS,
        rules: [ruleId],
      });

      if (circuitRun.results.length === 0) {
        // Known id but evaluator returned nothing — treat as evaluation error, not green.
        const finding: TraceCheckFinding = {
          ruleId,
          severity: "error",
          status: "fail",
          message: `Circuit rule ${ruleId} produced no evaluation result.`,
          evidence: [],
        };
        findings.push(finding);
        failed += 1;
        errors += 1;
        ruleExecutions.push(extensionExecution(ruleId, [finding], { runId, errored: true }));
        continue;
      }

      const ruleFindings: TraceCheckFinding[] = [];
      for (const item of circuitRun.results) {
        const finding = circuitFinding(item);
        ruleFindings.push(finding);
        findings.push(finding);
        if (finding.status === "fail") failed += 1;
        else if (finding.status === "warning") warnings += 1;
        else passed += 1;
      }
      ruleExecutions.push(extensionExecution(ruleId, ruleFindings, { runId }));
    }
  }

  const status =
    result.status === "error" || errors > 0
      ? "error"
      : failed > 0
        ? "fail"
        : result.status;
  return {
    ...result,
    ok: status === "pass",
    status,
    summary: {
      passed,
      failed,
      warnings,
      errors,
      rulesEvaluated: ruleExecutions.length,
      rulesPassed: ruleExecutions.filter((item) => item.status === "pass").length,
      rulesWarning: ruleExecutions.filter((item) => item.status === "warning").length,
      rulesFailed: ruleExecutions.filter((item) => item.status === "fail").length,
      rulesError: ruleExecutions.filter((item) => item.status === "error").length,
    },
    findings,
    ruleExecutions,
  };
}
