import type { ExportFormat, ExportValidationResult } from "./types.js";

const EXPERIMENTAL =
  "Experimental compatibility export — verify against your target tooling before relying on it.";

/** OTLP fixed64 / Unix nano unsigned bound (inclusive). */
const UINT64_MAX = 18446744073709551615n;
/** OTLP int64 signed bounds (inclusive). */
const INT64_MIN = -9223372036854775808n;
const INT64_MAX = 9223372036854775807n;

const MAX_ANYVALUE_DEPTH = 8;
const MAX_ANYVALUE_ELEMENTS = 256;
const MAX_DIAGNOSTIC_ERRORS = 64;

function pushPath(
  errors: string[],
  path: string,
  message: string,
): void {
  if (errors.length >= MAX_DIAGNOSTIC_ERRORS) return;
  errors.push(`${path}: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isHexId(value: unknown, byteLen: number): boolean {
  return typeof value === "string" && new RegExp(`^[0-9a-fA-F]{${byteLen * 2}}$`).test(value);
}

function parseDecimalIntegerString(
  value: unknown,
): { ok: true; n: bigint } | { ok: false; reason: string } {
  if (typeof value !== "string" || !/^-?\d+$/.test(value)) {
    return { ok: false, reason: "must be a decimal integer string" };
  }
  try {
    return { ok: true, n: BigInt(value) };
  } catch {
    return { ok: false, reason: "out of integer range" };
  }
}

function validateUint64String(
  errors: string[],
  path: string,
  value: unknown,
  label: string,
): void {
  const parsed = parseDecimalIntegerString(value);
  if (!parsed.ok) {
    pushPath(errors, path, `${label} ${parsed.reason}`);
    return;
  }
  if (parsed.n < 0n || parsed.n > UINT64_MAX) {
    pushPath(
      errors,
      path,
      `${label} must be an unsigned 64-bit integer (0..${UINT64_MAX.toString()})`,
    );
  }
}

function validateInt64String(
  errors: string[],
  path: string,
  value: unknown,
): void {
  const parsed = parseDecimalIntegerString(value);
  if (!parsed.ok) {
    pushPath(errors, path, parsed.reason);
    return;
  }
  if (parsed.n < INT64_MIN || parsed.n > INT64_MAX) {
    pushPath(
      errors,
      path,
      `must be a signed 64-bit integer (${INT64_MIN.toString()}..${INT64_MAX.toString()})`,
    );
  }
}

function validateAnyValue(
  errors: string[],
  path: string,
  value: unknown,
  depth = 0,
  counters = { elements: 0 },
): void {
  if (errors.length >= MAX_DIAGNOSTIC_ERRORS) return;
  if (depth > MAX_ANYVALUE_DEPTH) {
    pushPath(errors, path, `AnyValue nesting exceeds depth ${MAX_ANYVALUE_DEPTH}`);
    return;
  }
  counters.elements += 1;
  if (counters.elements > MAX_ANYVALUE_ELEMENTS) {
    pushPath(
      errors,
      path,
      `AnyValue element count exceeds ${MAX_ANYVALUE_ELEMENTS}`,
    );
    return;
  }

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
    return;
  }

  const arm = variants[0]!;
  switch (arm) {
    case "stringValue":
      if (typeof value.stringValue !== "string") {
        pushPath(errors, `${path}.stringValue`, "must be a string");
      }
      break;
    case "boolValue":
      if (typeof value.boolValue !== "boolean") {
        pushPath(errors, `${path}.boolValue`, "must be a boolean");
      }
      break;
    case "intValue":
      validateInt64String(errors, `${path}.intValue`, value.intValue);
      break;
    case "doubleValue":
      if (typeof value.doubleValue !== "number" || !Number.isFinite(value.doubleValue)) {
        pushPath(errors, `${path}.doubleValue`, "must be a finite number");
      }
      break;
    case "bytesValue":
      if (typeof value.bytesValue !== "string") {
        pushPath(errors, `${path}.bytesValue`, "must be a base64 string");
      }
      break;
    case "arrayValue": {
      if (!isRecord(value.arrayValue)) {
        pushPath(errors, `${path}.arrayValue`, "must be an object");
        break;
      }
      const values = value.arrayValue.values;
      if (values === undefined) break;
      if (!Array.isArray(values)) {
        pushPath(errors, `${path}.arrayValue.values`, "must be an array");
        break;
      }
      values.forEach((item, i) => {
        validateAnyValue(
          errors,
          `${path}.arrayValue.values[${i}]`,
          item,
          depth + 1,
          counters,
        );
      });
      break;
    }
    case "kvlistValue": {
      if (!isRecord(value.kvlistValue)) {
        pushPath(errors, `${path}.kvlistValue`, "must be an object");
        break;
      }
      const values = value.kvlistValue.values;
      if (values === undefined) break;
      if (!Array.isArray(values)) {
        pushPath(errors, `${path}.kvlistValue.values`, "must be an array");
        break;
      }
      values.forEach((item, i) => {
        const itemPath = `${path}.kvlistValue.values[${i}]`;
        if (!isRecord(item)) {
          pushPath(errors, itemPath, "must be a KeyValue object");
          return;
        }
        if (typeof item.key !== "string") {
          pushPath(errors, `${itemPath}.key`, "must be a string");
        }
        validateAnyValue(errors, `${itemPath}.value`, item.value, depth + 1, counters);
      });
      break;
    }
    default:
      break;
  }
}

function validateKeyValueList(
  errors: string[],
  path: string,
  attrs: unknown,
): void {
  if (attrs === undefined) return;
  if (!Array.isArray(attrs)) {
    pushPath(errors, path, "must be an array");
    return;
  }
  attrs.forEach((attr, ai) => {
    const attrPath = `${path}[${ai}]`;
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
    if (isRecord(resourceSpan.resource)) {
      validateKeyValueList(
        errors,
        `${rsPath}.resource.attributes`,
        resourceSpan.resource.attributes,
      );
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
      if (isRecord(scopeSpan.scope)) {
        validateKeyValueList(
          errors,
          `${ssPath}.scope.attributes`,
          scopeSpan.scope.attributes,
        );
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

        validateUint64String(
          errors,
          `${spanPath}.startTimeUnixNano`,
          span.startTimeUnixNano,
          "startTimeUnixNano",
        );
        if (span.endTimeUnixNano !== undefined) {
          validateUint64String(
            errors,
            `${spanPath}.endTimeUnixNano`,
            span.endTimeUnixNano,
            "endTimeUnixNano",
          );
        }
        if (
          typeof span.startTimeUnixNano === "string" &&
          typeof span.endTimeUnixNano === "string"
        ) {
          const start = parseDecimalIntegerString(span.startTimeUnixNano);
          const end = parseDecimalIntegerString(span.endTimeUnixNano);
          if (start.ok && end.ok && end.n < start.n) {
            pushPath(
              errors,
              `${spanPath}.endTimeUnixNano`,
              "must be >= startTimeUnixNano",
            );
          }
        }

        validateKeyValueList(errors, `${spanPath}.attributes`, span.attributes);

        if (Array.isArray(span.events)) {
          span.events.forEach((event, ei) => {
            const eventPath = `${spanPath}.events[${ei}]`;
            if (!isRecord(event)) {
              pushPath(errors, eventPath, "must be an object");
              return;
            }
            if (event.timeUnixNano !== undefined) {
              validateUint64String(
                errors,
                `${eventPath}.timeUnixNano`,
                event.timeUnixNano,
                "timeUnixNano",
              );
            }
            validateKeyValueList(errors, `${eventPath}.attributes`, event.attributes);
          });
        }

        if (Array.isArray(span.links)) {
          span.links.forEach((link, li) => {
            const linkPath = `${spanPath}.links[${li}]`;
            if (!isRecord(link)) {
              pushPath(errors, linkPath, "must be an object");
              return;
            }
            validateKeyValueList(errors, `${linkPath}.attributes`, link.attributes);
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
