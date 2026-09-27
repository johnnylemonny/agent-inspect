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

function isHexId(value: unknown, byteLen: number): boolean {
  return typeof value === "string" && new RegExp(`^[0-9a-fA-F]{${byteLen * 2}}$`).test(value);
}

function validateAnyValue(
  errors: string[],
  path: string,
  value: unknown,
): void {
  if (!isRecord(value)) {
    pushPath(errors, path, "must be an AnyValue object");
    return;
  }
  const variants = [
    "stringValue",
    "boolValue",
    "intValue",
    "doubleValue",
    "bytesValue",
    "arrayValue",
    "kvlistValue",
  ].filter((key) => value[key] !== undefined);
  if (variants.length !== 1) {
    pushPath(
      errors,
      path,
      `AnyValue must set exactly one variant (found ${variants.length}: ${variants.join(",")})`,
    );
  }
  if (value.intValue !== undefined) {
    if (typeof value.intValue !== "string" || !/^-?\d+$/.test(value.intValue)) {
      pushPath(errors, `${path}.intValue`, "must be a decimal integer string");
    }
  }
}

function validateOtlpJson(content: string): ExportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [
    EXPERIMENTAL,
    "OTLP JSON mapping uses OTel GenAI-aligned attributes where applicable; collectors may require transformation.",
    "producer-profile checks IDs, timing, and AnyValue shape; historical string enums are reader-compat warnings only.",
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
        if (!isHexId(span.traceId, 16)) {
          pushPath(
            errors,
            `${spanPath}.traceId`,
            "must be a 32-char hex trace id (16 bytes)",
          );
        }
        if (!isHexId(span.spanId, 8)) {
          pushPath(
            errors,
            `${spanPath}.spanId`,
            "must be a 16-char hex span id (8 bytes)",
          );
        }
        if (
          span.parentSpanId !== undefined &&
          !isHexId(span.parentSpanId, 8)
        ) {
          pushPath(
            errors,
            `${spanPath}.parentSpanId`,
            "must be a 16-char hex span id when present",
          );
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
        if (
          typeof span.startTimeUnixNano === "string" &&
          /^\d+$/.test(span.startTimeUnixNano) &&
          typeof span.endTimeUnixNano === "string" &&
          /^\d+$/.test(span.endTimeUnixNano)
        ) {
          try {
            if (BigInt(span.endTimeUnixNano) < BigInt(span.startTimeUnixNano)) {
              pushPath(
                errors,
                `${spanPath}.endTimeUnixNano`,
                "must be >= startTimeUnixNano",
              );
            }
          } catch {
            pushPath(errors, `${spanPath}.endTimeUnixNano`, "out of integer range");
          }
        }

        if (Array.isArray(span.attributes)) {
          span.attributes.forEach((attr, ai) => {
            const attrPath = `${spanPath}.attributes[${ai}]`;
            if (!isRecord(attr)) {
              pushPath(errors, attrPath, "must be an object");
              return;
            }
            if (typeof attr.key !== "string") {
              pushPath(errors, `${attrPath}.key`, "must be a string");
            }
            validateAnyValue(errors, `${attrPath}.value`, attr.value);
          });
        }

        // SpanKind: numeric preferred; historical string enums remain reader-compat.
        if (typeof span.kind === "number") {
          if (!Number.isInteger(span.kind)) {
            pushPath(errors, `${spanPath}.kind`, "must be an integer SpanKind enum");
          }
        } else if (typeof span.kind === "string") {
          warnings.push(
            `${spanPath}.kind: string SpanKind is historical reader-compat only; producer wire format uses numeric enums`,
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
                `${spanPath}.status.code: string StatusCode is historical reader-compat only; producer wire format uses numeric 0/1/2`,
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
