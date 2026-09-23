import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveTraceDir, type RedactionProfile } from "@agent-inspect/core/advanced";
import {
  exportRunTree,
  validateExport,
  type ExportFormat,
  type ExportOptions,
} from "@agent-inspect/core/exporters";
import { persistedInspectEventsToRunTrees } from "@agent-inspect/core/persisted";

import {
  resolveOutputOption,
  resolveRedactionProfileOption,
} from "./cli-option-aliases.js";
import { readRunPersistedEvents } from "./read-run.js";

export interface ExportCommandOptions {
  dir?: string;
  format?: string;
  output?: string;
  out?: string;
  json?: boolean;
  validate?: boolean;
  includeAttributes?: boolean;
  noMetadata?: boolean;
  noErrors?: boolean;
  redactionProfile?: string;
  profile?: string;
}

function parseRedactionProfile(s: string | undefined): RedactionProfile {
  const v = (s ?? "local").trim().toLowerCase();
  if (v === "local" || v === "share" || v === "strict") {
    return v;
  }
  throw new Error(
    `Unsupported --redaction-profile "${s ?? ""}". Use local, share, or strict.`,
  );
}

function parseExportFormat(s: string | undefined): ExportFormat {
  const v = (s ?? "markdown").trim().toLowerCase();
  if (
    v === "markdown" ||
    v === "html" ||
    v === "openinference" ||
    v === "otlp-json"
  ) {
    return v;
  }
  throw new Error(
    `Unsupported --format "${s ?? ""}". Use markdown, html, openinference, or otlp-json.`,
  );
}

export async function exportCommand(
  runId: string,
  options: ExportCommandOptions = {},
): Promise<void> {
  const id =
    typeof runId === "string" && runId.trim() !== "" ? runId.trim() : "";
  if (id === "") {
    console.error("Run id is required");
    process.exitCode = 1;
    return;
  }

  let format: ExportFormat;
  let redactionProfile: RedactionProfile;
  try {
    format = parseExportFormat(options.format);
    redactionProfile = parseRedactionProfile(resolveRedactionProfileOption(options));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(msg);
    process.exitCode = 1;
    return;
  }

  const traceDir = resolveTraceDir({ dir: options.dir });
  let events;
  try {
    const result = await readRunPersistedEvents(id, traceDir);
    events = result?.events ?? [];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[AgentInspect] export failed: ${msg}`);
    process.exitCode = 1;
    return;
  }

  if (events.length === 0) {
    console.error(`Run not found or trace is empty: ${id}\nTrace directory: ${traceDir}`);
    process.exitCode = 1;
    return;
  }

  let tree;
  try {
    const trees = persistedInspectEventsToRunTrees(events);
    tree = trees.find((candidate) => candidate.runId === id) ?? trees[0];
    if (tree === undefined) {
      throw new Error("No run tree could be built from persisted events");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[AgentInspect] export failed: ${msg}`);
    process.exitCode = 1;
    return;
  }

  const exportOpts: ExportOptions = {
    format,
    includeMetadata: options.noMetadata === true ? false : true,
    includeAttributes: options.includeAttributes === true,
    includeErrors: options.noErrors === true ? false : true,
    pretty: true,
    redacted: true,
    maxAttributeLength: 500,
    redactionProfile,
  };

  const result = exportRunTree(tree, exportOpts);
  const validation =
    options.validate === true ? validateExport(result) : undefined;

  if (validation !== undefined && !validation.ok) {
    process.exitCode = 1;
  }

  const resolvedOutput = resolveOutputOption(options);
  const outPath =
    resolvedOutput !== undefined ? path.resolve(resolvedOutput) : undefined;

  if (outPath !== undefined) {
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, result.content, "utf-8");
    const vlabel =
      validation !== undefined ? (validation.ok ? "ok" : "failed") : "skipped";
    // Human progress stays on stderr so `--json` stdout remains a single parseable object.
    console.error(
      `Wrote ${result.fileExtension} export to ${outPath} (validation: ${vlabel})`,
    );
    if (validation !== undefined && !validation.ok) {
      console.error("Validation errors:", validation.errors.join("; "));
    }
  }

  if (options.json === true) {
    const payload: Record<string, unknown> = {
      format: result.format,
      contentType: result.contentType,
      fileExtension: result.fileExtension,
      warnings: [...result.warnings, ...(validation?.warnings ?? [])],
      validation,
    };
    if (outPath !== undefined) {
      payload.out = outPath;
    } else {
      payload.content = result.content;
    }
    console.log(JSON.stringify(payload, null, 2));
    if (validation !== undefined && !validation.ok) {
      console.error("Validation errors:", validation.errors.join("; "));
    }
  } else if (outPath === undefined) {
    console.log(result.content);
    if (options.validate === true && validation !== undefined) {
      if (validation.ok) {
        console.error(`Validation: ok (${validation.warnings.length} warning(s))`);
      } else {
        console.error("Validation failed:", validation.errors.join("; "));
      }
      if (validation.warnings.length > 0) {
        console.error("Warnings:", validation.warnings.join("; "));
      }
    }
  }
}
