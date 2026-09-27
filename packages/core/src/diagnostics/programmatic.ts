/**
 * Stable programmatic diagnostic codes for readers / TraceFacts / TraceContract.
 *
 * Lowercase `TraceReadError.code` values remain the published reader error codes.
 * These `AI_*` identifiers appear in messages and catalogs for actionable remediation.
 *
 * @experimental Additive in 6.15.0; do not replace published lowercase reader codes.
 */

export type ProgrammaticDiagnosticCode =
  | "AI_TRACE_INPUT_INVALID"
  | "AI_TRACE_FORMAT_UNSUPPORTED"
  | "AI_TRACE_FORMAT_AMBIGUOUS"
  | "AI_TRACE_FACTS_INPUT_NOT_NORMALIZED"
  | "AI_TRACE_CONTRACT_RUN_SELECTION_REQUIRED"
  | "AI_TRACE_RELATIONSHIP_SELF_PARENT"
  | "AI_TRACE_RELATIONSHIP_CYCLE"
  | "AI_TRACE_CONTRACT_INPUT_INVALID"
  | "AI_INSPECT_RUN_UNSUPPORTED_OPTION";

export interface ProgrammaticDiagnosticSpec {
  readonly code: ProgrammaticDiagnosticCode;
  /** Short problem statement (without the code prefix). */
  readonly summary: string;
  /** Actionable remediation hint (always included in formatted messages). */
  readonly remediation: string;
  /** Related published / capture codes that must remain valid. */
  readonly relatedCodes?: readonly string[];
}

export const PROGRAMMATIC_DIAGNOSTIC_SPECS: Readonly<
  Record<ProgrammaticDiagnosticCode, ProgrammaticDiagnosticSpec>
> = Object.freeze({
  AI_TRACE_INPUT_INVALID: {
    code: "AI_TRACE_INPUT_INVALID",
    summary:
      'Expected { type: "file", path }, { type: "directory", path }, { type: "string", content }, { type: "buffer", content }, or { type: "stdin" }.',
    remediation: "For a file path, use openTraceFile(path).",
    relatedCodes: ["invalid_input"],
  },
  AI_TRACE_FORMAT_UNSUPPORTED: {
    code: "AI_TRACE_FORMAT_UNSUPPORTED",
    summary: "No trace reader could detect the input format.",
    remediation:
      "Pass an AgentInspect JSONL file via openTraceFile, or set options.format to a registered reader.",
    relatedCodes: ["unsupported_format"],
  },
  AI_TRACE_FORMAT_AMBIGUOUS: {
    code: "AI_TRACE_FORMAT_AMBIGUOUS",
    summary: "Multiple trace readers matched the input with equal confidence.",
    remediation: "Set options.format explicitly to disambiguate the reader.",
    relatedCodes: ["ambiguous_format"],
  },
  AI_TRACE_FACTS_INPUT_NOT_NORMALIZED: {
    code: "AI_TRACE_FACTS_INPUT_NOT_NORMALIZED",
    summary: "TraceFacts requires TraceReadResult or PersistedInspectEvent[].",
    remediation: "Use openTraceFile() to normalize a JSONL trace first.",
  },
  AI_TRACE_CONTRACT_RUN_SELECTION_REQUIRED: {
    code: "AI_TRACE_CONTRACT_RUN_SELECTION_REQUIRED",
    summary: "Multiple runs are available; select a run before executing checks.",
    remediation: "Pass options.runId or TraceCheckInput.selectedRun.",
    relatedCodes: ["AI_CHECK_RUN_SELECTION_REQUIRED"],
  },
  AI_TRACE_RELATIONSHIP_SELF_PARENT: {
    code: "AI_TRACE_RELATIONSHIP_SELF_PARENT",
    summary: "A parentId equals its own event/step id.",
    remediation:
      "Reject at capture (AI_LANGGRAPH_SELF_PARENT_REJECTED) or drop via logical projection; do not invent replacement parents.",
    relatedCodes: [
      "AI_LANGGRAPH_SELF_PARENT_REJECTED",
      "AI_LOGICAL_SELF_PARENT_REMOVED",
    ],
  },
  AI_TRACE_RELATIONSHIP_CYCLE: {
    code: "AI_TRACE_RELATIONSHIP_CYCLE",
    summary: "Trace contains a parentId cycle.",
    remediation:
      "Use visibility-first tree linking for legacy fixtures; prefer acyclic capture for new adapter output.",
    relatedCodes: ["structure.cycle"],
  },
  AI_TRACE_CONTRACT_INPUT_INVALID: {
    code: "AI_TRACE_CONTRACT_INPUT_INVALID",
    summary:
      "evaluateTraceContract expects ({ read }, contract) or use evaluateTraceContractRead(read, contract).",
    remediation:
      "Pass TraceCheckInput as the first argument: evaluateTraceContract({ read }, contract).",
    relatedCodes: ["AI_CHECK_INVALID_ARGUMENTS"],
  },
  AI_INSPECT_RUN_UNSUPPORTED_OPTION: {
    code: "AI_INSPECT_RUN_UNSUPPORTED_OPTION",
    summary: 'inspectRun does not accept a "writer" option.',
    remediation:
      "Use createInspector({ writer }) then inspector.run(...). inspectRun persists via the global JSONL path (schema 0.1).",
  },
});

/**
 * Format `CODE: summary Remediation: …` for thrown errors and diagnostics.
 */
export function formatProgrammaticDiagnostic(
  code: ProgrammaticDiagnosticCode,
  detail?: string,
): string {
  const spec = PROGRAMMATIC_DIAGNOSTIC_SPECS[code];
  const summary = detail?.trim() ? detail.trim() : spec.summary;
  return `${code}: ${summary} Remediation: ${spec.remediation}`;
}
