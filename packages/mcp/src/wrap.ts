import { step } from "agent-inspect";

import { hashServerUrl, summarizeMcpValue } from "./summarize.js";
import type {
  McpClientLike,
  McpClientTracerOptions,
  McpRequestOptions,
  McpTraceMetadata,
} from "./types.js";

let toolCallCounter = 0;

function nextToolCallId(prefix?: string): string {
  toolCallCounter += 1;
  const base = prefix?.trim() || "mcp";
  return `${base}-${toolCallCounter}`;
}

function baseMetadata(
  options: McpClientTracerOptions,
  overrides: Partial<McpTraceMetadata> = {},
): Record<string, unknown> {
  const metadata: McpTraceMetadata = {
    source: { type: "mcp-client" },
    ...(options.serverName ? { mcpServerName: options.serverName } : {}),
    ...(options.serverUrl
      ? { mcpServerUrlHash: hashServerUrl(options.serverUrl) }
      : {}),
    ...(options.sessionId ? { sessionId: options.sessionId } : {}),
    ...overrides,
  };
  return { ...(options.metadata ?? {}), ...metadata };
}

/** SDK RequestOptions keys — must never be swallowed as AgentInspect metadata. */
const SDK_REQUEST_OPTION_KEYS = [
  "signal",
  "timeout",
  "onprogress",
  "resetTimeoutOnProgress",
  "maxTotalTimeout",
  "relatedRequestId",
  "resumptionToken",
  "onresumptiontoken",
] as const;

function isSdkRequestOptions(value: unknown): value is McpRequestOptions {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return SDK_REQUEST_OPTION_KEYS.some((key) => key in obj);
}

/**
 * AgentInspect per-call metadata bag: `{ metadata: {...} }` without SDK option keys.
 * Must not consume ordinary SDK RequestOptions that happen to be objects.
 */
function isAgentInspectMetadataBag(
  value: unknown,
): value is { metadata?: Record<string, unknown> } {
  if (!value || typeof value !== "object") return false;
  if (isSdkRequestOptions(value)) return false;
  const obj = value as Record<string, unknown>;
  if (!("metadata" in obj)) return false;
  // Zod/result schemas expose parse — never treat those as AI bags.
  if ("parse" in obj) return false;
  return true;
}

function extractCallMetadata(bag: {
  metadata?: Record<string, unknown>;
}): Record<string, unknown> {
  if (bag.metadata && typeof bag.metadata === "object") {
    return bag.metadata;
  }
  return {};
}

/**
 * Resolve SDK callTool arity:
 *   callTool(params, resultSchema?, requestOptions?)
 * plus AgentInspect overloads that peel `{ metadata }` without dropping RequestOptions.
 */
export function resolveCallToolArgs(
  resultSchemaOrOptions?: unknown,
  maybeOptions?: unknown,
): {
  resultSchema: unknown;
  requestOptions: McpRequestOptions | undefined;
  callMetadata: Record<string, unknown>;
} {
  // Three-arg form: (params, schema|undefined, options)
  if (maybeOptions !== undefined) {
    let callMetadata: Record<string, unknown> = {};
    let requestOptions: McpRequestOptions | undefined;

    if (isAgentInspectMetadataBag(maybeOptions)) {
      callMetadata = extractCallMetadata(maybeOptions);
      // Remaining SDK keys (if any were mixed in) still forward — but AI bags exclude them.
      requestOptions = undefined;
    } else if (isSdkRequestOptions(maybeOptions) || maybeOptions === null) {
      requestOptions =
        maybeOptions && typeof maybeOptions === "object"
          ? (maybeOptions as McpRequestOptions)
          : undefined;
    } else if (maybeOptions && typeof maybeOptions === "object") {
      // Unknown object third arg — forward as RequestOptions to preserve caller intent.
      requestOptions = maybeOptions as McpRequestOptions;
    }

    return {
      resultSchema: resultSchemaOrOptions,
      requestOptions,
      callMetadata,
    };
  }

  // Two-arg form: (params, schema) OR (params, { metadata }) OR (params, RequestOptions)
  if (isAgentInspectMetadataBag(resultSchemaOrOptions)) {
    return {
      resultSchema: undefined,
      requestOptions: undefined,
      callMetadata: extractCallMetadata(resultSchemaOrOptions),
    };
  }

  if (isSdkRequestOptions(resultSchemaOrOptions)) {
    return {
      resultSchema: undefined,
      requestOptions: resultSchemaOrOptions,
      callMetadata: {},
    };
  }

  return {
    resultSchema: resultSchemaOrOptions,
    requestOptions: undefined,
    callMetadata: {},
  };
}

function invokeCallTool(
  callToolImpl: McpClientLike["callTool"],
  params: Parameters<McpClientLike["callTool"]>[0],
  resultSchema: unknown,
  requestOptions: McpRequestOptions | undefined,
): Promise<unknown> {
  const fn = callToolImpl as (
    p: unknown,
    schema?: unknown,
    opts?: unknown,
  ) => Promise<unknown>;
  if (requestOptions !== undefined) {
    return fn(params, resultSchema, requestOptions);
  }
  if (resultSchema !== undefined) {
    return fn(params, resultSchema);
  }
  return fn(params);
}

/**
 * Wraps an MCP client so tools/list and tools/call emit local tool steps.
 * Telemetry only — does not proxy network behavior beyond the wrapped client.
 *
 * Uses a Proxy over the original client so prototype methods (`connect`,
 * `close`, `listResources`, …), private SDK state, and `instanceof` stay intact.
 * A shallow object spread would drop prototype methods and copy private fields.
 *
 * Forwards the real SDK argument positions, including `RequestOptions`
 * (`signal`, `timeout`, progress callbacks). Does not fake cancellation while
 * still dispatching the underlying request.
 */
export function wrapMcpClient<T extends McpClientLike>(
  client: T,
  options: McpClientTracerOptions = {},
): T {
  const maxSummaryLength = options.maxSummaryLength ?? 240;

  const listToolsImpl =
    typeof client.listTools === "function"
      ? client.listTools.bind(client)
      : undefined;
  const callToolImpl = client.callTool.bind(client);

  const wrappedListTools = listToolsImpl
    ? async (params?: unknown, requestOptions?: McpRequestOptions) =>
        step(
          "mcp:tools/list",
          async () => {
            if (requestOptions !== undefined) {
              return (
                listToolsImpl as (
                  p?: unknown,
                  opts?: unknown,
                ) => Promise<unknown>
              )(params, requestOptions);
            }
            return listToolsImpl(params);
          },
          {
            type: "tool",
            metadata: baseMetadata(options, {
              toolName: "tools/list",
              toolCallId: nextToolCallId(options.toolCallIdPrefix),
            }),
          },
        )
    : undefined;

  const wrappedCallTool = async (
    params: Parameters<McpClientLike["callTool"]>[0],
    resultSchemaOrOptions?: unknown,
    maybeOptions?: unknown,
  ) => {
    const { resultSchema, requestOptions, callMetadata } = resolveCallToolArgs(
      resultSchemaOrOptions,
      maybeOptions,
    );

    return step(
      `mcp:${params.name}`,
      async () =>
        invokeCallTool(callToolImpl, params, resultSchema, requestOptions),
      {
        type: "tool",
        metadata: baseMetadata(options, {
          toolName: params.name,
          toolCallId: nextToolCallId(options.toolCallIdPrefix),
          argumentSummary: summarizeMcpValue(
            params.arguments ?? {},
            maxSummaryLength,
          ),
          ...callMetadata,
        }),
      },
    );
  };

  return new Proxy(client, {
    get(target, property, receiver) {
      if (property === "listTools" && wrappedListTools !== undefined) {
        return wrappedListTools;
      }
      if (property === "callTool") {
        return wrappedCallTool;
      }
      const value = Reflect.get(target, property, receiver);
      if (typeof value === "function") {
        return value.bind(target);
      }
      return value;
    },
  }) as T;
}

/** @internal resets tool call ids for deterministic tests */
export function resetMcpToolCallIdsForTests(): void {
  toolCallCounter = 0;
}
