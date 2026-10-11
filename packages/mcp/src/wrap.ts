import { step } from "agent-inspect";

import { hashServerUrl, summarizeMcpValue } from "./summarize.js";
import type {
  McpClientLike,
  McpClientTracerOptions,
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

/**
 * Wraps an MCP client so tools/list and tools/call emit local tool steps.
 * Telemetry only — does not proxy network behavior beyond the wrapped client.
 *
 * Uses a Proxy over the original client so prototype methods (`connect`,
 * `close`, `listResources`, …), private SDK state, and `instanceof` stay intact.
 * A shallow object spread would drop prototype methods and copy private fields.
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
    ? async (params?: unknown) =>
        step(
          "mcp:tools/list",
          async () => {
            const result = await listToolsImpl(params);
            return result;
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
    maybeOptions?: { metadata?: Record<string, unknown> },
  ) => {
    let resultSchema: unknown;
    let callMetadata: Record<string, unknown> = {};
    if (maybeOptions && typeof maybeOptions === "object") {
      resultSchema = resultSchemaOrOptions;
      if (maybeOptions.metadata && typeof maybeOptions.metadata === "object") {
        callMetadata = maybeOptions.metadata;
      }
    } else if (
      resultSchemaOrOptions &&
      typeof resultSchemaOrOptions === "object" &&
      resultSchemaOrOptions !== null &&
      "metadata" in resultSchemaOrOptions &&
      !("parse" in (resultSchemaOrOptions as object))
    ) {
      const bag = resultSchemaOrOptions as { metadata?: Record<string, unknown> };
      if (bag.metadata && typeof bag.metadata === "object") {
        callMetadata = bag.metadata;
      }
    } else {
      resultSchema = resultSchemaOrOptions;
    }

    return step(
      `mcp:${params.name}`,
      async () => {
        if (resultSchema !== undefined) {
          return (callToolImpl as (...args: unknown[]) => Promise<unknown>)(
            params,
            resultSchema,
          );
        }
        return callToolImpl(params);
      },
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
