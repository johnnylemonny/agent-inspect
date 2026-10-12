export interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface McpListToolsResult {
  tools: McpToolDescriptor[];
}

export interface McpCallToolParams {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface McpCallToolResult {
  content?: unknown;
  isError?: boolean;
  structuredContent?: unknown;
}

/**
 * Subset of MCP SDK `RequestOptions` forwarded by the wrapper.
 * Compatible with @modelcontextprotocol/sdk without requiring it at runtime.
 */
export interface McpRequestOptions {
  signal?: AbortSignal;
  timeout?: number;
  onprogress?: (...args: unknown[]) => void;
  resetTimeoutOnProgress?: boolean;
  maxTotalTimeout?: number;
  relatedRequestId?: string;
  resumptionToken?: string;
  onresumptiontoken?: (...args: unknown[]) => void;
  /** AgentInspect per-call metadata (optional; never consumes SDK option keys). */
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Minimal MCP client surface for local tracing. Compatible with common SDK
 * client shapes without requiring @modelcontextprotocol/sdk at runtime.
 *
 * Method syntax (not property function types) so real SDK `Client` remains
 * assignable under `strictFunctionTypes` (bivariant method parameters).
 * `callTool` returns `Promise<unknown>` to accept both normal tool results and
 * the SDK compatibility `{ toolResult }` branch.
 *
 * Matches SDK arity: `callTool(params, resultSchema?, requestOptions?)` and
 * `listTools(params?, requestOptions?)`. AgentInspect also accepts a
 * `{ metadata }` bag in place of schema/options when it is not RequestOptions-shaped.
 */
export interface McpClientLike {
  listTools?(
    params?: unknown,
    options?: unknown,
  ): Promise<McpListToolsResult | unknown>;
  callTool(
    params: McpCallToolParams,
    resultSchemaOrOptions?: unknown,
    options?: unknown,
  ): Promise<unknown>;
}

export interface McpClientTracerOptions {
  serverName?: string;
  serverUrl?: string;
  sessionId?: string;
  toolCallIdPrefix?: string;
  maxSummaryLength?: number;
  metadata?: Record<string, unknown>;
}

export interface McpTraceMetadata {
  source: { type: "mcp-client" };
  mcpServerName?: string;
  mcpServerUrlHash?: string;
  sessionId?: string;
  toolName?: string;
  toolCallId?: string;
  mcpToolCallId?: string;
  argumentSummary?: string;
  resultSummary?: string;
  durationMs?: number;
  isError?: boolean;
}
