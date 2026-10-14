/**
 * Physical delivery vs logical execution identity helpers.
 *
 * Reader/manual converters may append a trailing `:<index>` delivery
 * discriminator on synthetic eventIds (`manual:…`, `inspect:…`). Native
 * opaque eventIds must not be rewritten with a global trailing-digit strip.
 *
 * @internal
 */

import { encodeCanonicalStructured } from "../checks/canonical-equality.js";

/** Bounded marker stamped when a tree collapses conflicting same-eventId rows. */
export const DELIVERY_CONFLICT_ATTR = "agent_inspect.delivery_conflict";

/** OTLP attrs carrying the non-preferred side of a direct/nested identity conflict. */
export const IDENTITY_CONFLICT_ATTR = {
  operationId: "agent_inspect.identity_conflict.operation_id",
  attemptId: "agent_inspect.identity_conflict.attempt_id",
  retryOf: "agent_inspect.identity_conflict.retry_of",
  attemptNumber: "agent_inspect.identity_conflict.attempt_number",
} as const;

const SYNTHETIC_DELIVERY_ID =
  /^(?:manual|inspect):[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:\d+$/;

/**
 * Strip a proven reader/manual delivery discriminator only.
 * Opaque native IDs (including trailing `:digits`) are preserved.
 */
export function stripReaderDeliveryDiscriminator(eventId: string): string {
  if (!SYNTHETIC_DELIVERY_ID.test(eventId)) return eventId;
  return eventId.replace(/:\d+$/, "");
}

export interface DeliveryIdentityFields {
  eventId: string;
  runId: string;
  kind: string;
  name: string;
  status?: string;
  parentId?: string;
  timestamp?: string | number;
  startedAt?: string;
  sourceType?: string;
  attributes?: Record<string, unknown>;
  operationId?: string | null;
  attemptId?: string | null;
  attemptNumber?: number | null;
  retryOf?: string | null;
}

function canonicalDigest(value: unknown): string | null {
  if (value === undefined) return null;
  const encoded = encodeCanonicalStructured(value);
  return encoded.ok ? encoded.value : `unencodable:${encoded.code}`;
}

function capturedContentDigest(attributes: Record<string, unknown> | undefined): {
  args: string | null;
  result: string | null;
} {
  if (!attributes || typeof attributes !== "object") {
    return { args: null, result: null };
  }
  const nested =
    attributes.metadata && typeof attributes.metadata === "object"
      ? (attributes.metadata as Record<string, unknown>)
      : undefined;
  const args =
    attributes.arguments ??
    attributes.args ??
    attributes.input ??
    nested?.arguments ??
    nested?.args ??
    nested?.input;
  const result =
    attributes.result ??
    attributes.output ??
    attributes.response ??
    nested?.result ??
    nested?.output ??
    nested?.response;
  return {
    args: args === undefined ? null : canonicalDigest(args),
    result: result === undefined ? null : canonicalDigest(result),
  };
}

function timeKey(fields: DeliveryIdentityFields): string | null {
  if (typeof fields.startedAt === "string" && fields.startedAt.trim() !== "") {
    return fields.startedAt;
  }
  if (typeof fields.timestamp === "string" && fields.timestamp.trim() !== "") {
    return fields.timestamp;
  }
  if (typeof fields.timestamp === "number" && Number.isFinite(fields.timestamp)) {
    return String(fields.timestamp);
  }
  return null;
}

/**
 * Fingerprint for identical-redelivery collapse vs conflicting reuse.
 * Includes run scope, opaque (or discriminator-stripped synthetic) eventId,
 * workflow identity, status/parent/source, time, and bounded captured content.
 */
export function deliverySemanticFingerprint(fields: DeliveryIdentityFields): string {
  const content = capturedContentDigest(fields.attributes);
  return JSON.stringify({
    stableEventId: stripReaderDeliveryDiscriminator(fields.eventId),
    runId: fields.runId,
    kind: fields.kind,
    name: fields.name,
    status: fields.status ?? null,
    parentId: fields.parentId ?? null,
    sourceType: fields.sourceType ?? null,
    time: timeKey(fields),
    operationId: fields.operationId ?? null,
    attemptId: fields.attemptId ?? null,
    attemptNumber: fields.attemptNumber ?? null,
    retryOf: fields.retryOf ?? null,
    argsDigest: content.args,
    resultDigest: content.result,
  });
}

/**
 * Pull supported identity fields from a direct/nested attributes bag for
 * tree/export fingerprints (does not invent missing values).
 */
export function identityFieldsFromAttributes(
  attributes: Record<string, unknown> | undefined,
): Pick<
  DeliveryIdentityFields,
  "operationId" | "attemptId" | "attemptNumber" | "retryOf"
> {
  if (!attributes || typeof attributes !== "object") {
    return {
      operationId: null,
      attemptId: null,
      attemptNumber: null,
      retryOf: null,
    };
  }
  const nested =
    attributes.metadata &&
    typeof attributes.metadata === "object" &&
    !Array.isArray(attributes.metadata)
      ? (attributes.metadata as Record<string, unknown>)
      : undefined;
  const pickString = (key: "operationId" | "attemptId" | "retryOf"): string | null => {
    const direct = attributes[key];
    if (typeof direct === "string" && direct.trim() !== "") return direct.trim();
    const nestedValue = nested?.[key];
    if (typeof nestedValue === "string" && nestedValue.trim() !== "") {
      return nestedValue.trim();
    }
    return null;
  };
  const pickNumber = (): number | null => {
    const direct = attributes.attemptNumber ?? attributes.attempt;
    if (typeof direct === "number" && Number.isFinite(direct)) return direct;
    const nestedValue = nested?.attemptNumber ?? nested?.attempt;
    if (typeof nestedValue === "number" && Number.isFinite(nestedValue)) {
      return nestedValue;
    }
    return null;
  };
  return {
    operationId: pickString("operationId"),
    attemptId: pickString("attemptId"),
    retryOf: pickString("retryOf"),
    attemptNumber: pickNumber(),
  };
}

export function hasDeliveryConflictMarker(
  attributes: Record<string, unknown> | undefined,
): boolean {
  return attributes?.[DELIVERY_CONFLICT_ATTR] === true;
}

/**
 * Stamp a bounded delivery-conflict marker without dropping provenance.
 * Does not mutate the input event object.
 */
export function stampDeliveryConflict<T extends { attributes?: Record<string, unknown> }>(
  event: T,
): T {
  return {
    ...event,
    attributes: {
      ...(event.attributes ?? {}),
      [DELIVERY_CONFLICT_ATTR]: true,
    },
  };
}
