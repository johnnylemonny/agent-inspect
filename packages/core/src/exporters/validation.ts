import type { ExportFormat, ExportValidationResult } from "./types.js";

const EXPERIMENTAL =
  "Experimental compatibility export — verify against your target tooling before relying on it.";

function pushPath(
  errors: string[],
  path: string,
  message: string,
): void {
  errors.push(`${path}: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateOtlpJson(content: string): ExportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [
    EXPERIMENTAL,
    "OTLP JSON mapping uses OTel GenAI-aligned attributes where applicable; collectors may require transformation.",
    "protocol-valid ≠ profile-complete ≠ fixture-complete — nested path diagnostics report protocol shape only.",
  ];

  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    pushPath(errors, "$", "OTLP JSON export is not valid JSON");
    return { ok: false, format: "otlp-json", errors, warnings };
  }

  if (!isRecord(parsed)) {
    pushPath(errors, "$", "OTLP JSON export must be an object");
    return { ok: false, format: "otlp-json", errors, warnings };
  }

  if (!Array.isArray(parsed.resourceSpans)) {
    pushPath(errors, "$.resourceSpans", "must be an array");
    return { ok: false, format: "otlp-json", errors, warnings };
  }

  parsed.resourceSpans.forEach((resourceSpan, rsi) => {
    const rsPath = `$.resourceSpans[${rsi}]`;
    if (!isRecord(resourceSpan)) {
      pushPath(errors, rsPath, "must be an object");
      return;
    }
    if (!Array.isArray(resourceSpan.scopeSpans)) {
      pushPath(errors, `${rsPath}.scopeSpans`, "must be an array");
      return;
    }
    resourceSpan.scopeSpans.forEach((scopeSpan, ssi) => {
      const ssPath = `${rsPath}.scopeSpans[${ssi}]`;
      if (!isRecord(scopeSpan)) {
        pushPath(errors, ssPath, "must be an object");
        return;
      }
      if (!Array.isArray(scopeSpan.spans)) {
        pushPath(errors, `${ssPath}.spans`, "must be an array");
        return;
      }
      scopeSpan.spans.forEach((span, spi) => {
        const spanPath = `${ssPath}.spans[${spi}]`;
        if (!isRecord(span)) {
          pushPath(errors, spanPath, "must be an object");
          return;
        }
        if (typeof span.traceId !== "string" || span.traceId.length === 0) {
          pushPath(errors, `${spanPath}.traceId`, "must be a non-empty string");
        }
        if (typeof span.spanId !== "string" || span.spanId.length === 0) {
          pushPath(errors, `${spanPath}.spanId`, "must be a non-empty string");
        }
        if (typeof span.name !== "string") {
          pushPath(errors, `${spanPath}.name`, "must be a string");
        }
        if (
          typeof span.startTimeUnixNano !== "string" ||
          !/^\d+$/.test(span.startTimeUnixNano)
        ) {
          pushPath(
            errors,
            `${spanPath}.startTimeUnixNano`,
            "must be a decimal-string 64-bit integer",
          );
        }
        if (
          span.endTimeUnixNano !== undefined &&
          (typeof span.endTimeUnixNano !== "string" ||
            !/^\d+$/.test(span.endTimeUnixNano))
        ) {
          pushPath(
            errors,
            `${spanPath}.endTimeUnixNano`,
            "must be a decimal-string 64-bit integer when present",
          );
        }

        // SpanKind: numeric preferred; historical string enums remain protocol-valid.
        if (typeof span.kind === "number") {
          if (!Number.isInteger(span.kind)) {
            pushPath(errors, `${spanPath}.kind`, "must be an integer SpanKind enum");
          }
        } else if (typeof span.kind === "string") {
          warnings.push(
            `${spanPath}.kind: string SpanKind enum is legacy; prefer numeric (INTERNAL=1)`,
          );
        } else if (span.kind !== undefined) {
          pushPath(
            errors,
            `${spanPath}.kind`,
            "must be numeric SpanKind or historical string enum",
          );
        }

        if (!isRecord(span.status)) {
          pushPath(errors, `${spanPath}.status`, "must be an object");
        } else {
          const code = span.status.code;
          if (typeof code === "number") {
            if (![0, 1, 2].includes(code)) {
              pushPath(
                errors,
                `${spanPath}.status.code`,
                "must be numeric StatusCode 0 (UNSET), 1 (OK), or 2 (ERROR)",
              );
            }
          } else if (typeof code === "string") {
            const upper = code.toUpperCase();
            if (
              upper !== "STATUS_CODE_UNSET" &&
              upper !== "STATUS_CODE_OK" &&
              upper !== "STATUS_CODE_ERROR" &&
              upper !== "UNSET" &&
              upper !== "OK" &&
              upper !== "ERROR" &&
              !/^[012]$/.test(code.trim())
            ) {
              pushPath(
                errors,
                `${spanPath}.status.code`,
                "unrecognized StatusCode string",
              );
            } else {
              warnings.push(
                `${spanPath}.status.code: string StatusCode is legacy; prefer numeric 0/1/2`,
              );
            }
          } else {
            pushPath(
              errors,
              `${spanPath}.status.code`,
              "must be numeric StatusCode 0/1/2 or historical string enum",
            );
          }
        }
      });
    });
  });

  return { ok: errors.length === 0, format: "otlp-json", errors, warnings };
}

export function validateExportContent(
  format: ExportFormat,
  content: string,
): ExportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [EXPERIMENTAL];

  if (format === "markdown") {
    if (!content.startsWith("# AgentInspect Run")) {
      errors.push('Markdown export must start with "# AgentInspect Run"');
    }
    return { ok: errors.length === 0, format, errors, warnings };
  }

  if (format === "html") {
    const lower = content.toLowerCase();
    if (!lower.includes("<!doctype html")) {
      errors.push("HTML export must include <!doctype html>");
    }
    if (/<\s*script\b/i.test(content)) {
      errors.push("HTML export must not contain script tags");
    }
    if (/<\s*link\b[^>]*href\s*=/i.test(content)) {
      warnings.push("HTML export contains link tags — ensure no external stylesheets.");
    }
    return { ok: errors.length === 0, format, errors, warnings };
  }

  if (format === "openinference") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content) as unknown;
    } catch {
      errors.push("OpenInference export is not valid JSON");
      return { ok: false, format, errors, warnings };
    }
    if (!parsed || typeof parsed !== "object") {
      errors.push("OpenInference export JSON must be an object");
      return { ok: false, format, errors, warnings };
    }
    const o = parsed as Record<string, unknown>;
    if (o.format !== "openinference") {
      errors.push('OpenInference export must include format: "openinference"');
    }
    if (!Array.isArray(o.spans)) {
      errors.push("OpenInference export must include a spans array");
    }
    warnings.push("OpenInference-compatible JSON is not guaranteed for every backend.");
    return { ok: errors.length === 0, format, errors, warnings };
  }

  if (format === "otlp-json") {
    return validateOtlpJson(content);
  }

  errors.push(`Unsupported export format`);
  return { ok: false, format, errors, warnings };
}
