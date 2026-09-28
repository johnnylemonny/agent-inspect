/**
 * Direct OpenAI Node `chat.completions.create` capture recipe (C03).
 *
 * Uses a local mock SDK client only — no OpenAI package, API keys, or network.
 * The awaited SDK call runs *inside* `inspector.llm`. SDK transport options
 * (`maxRetries`, `timeout`, `signal`) belong on the request-options argument,
 * not the chat body. HTTP request id is recorded separately from the completion
 * resource id (`chatcmpl-…`).
 */
import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { createInspector } from "agent-inspect/advanced";
import { fileWriter, memoryWriter, type TraceWriter } from "agent-inspect/writers";

type ChatCompletion = {
  id: string;
  model: string;
  choices: Array<{
    finish_reason: string;
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{ id: string; type: string; function: { name: string } }>;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  /** Mock stand-in for OpenAI SDK response._request_id / header x-request-id. */
  _request_id?: string;
};

type CreateParams = {
  model: string;
  messages: Array<{ role: string; content: string }>;
};

type RequestOptions = {
  maxRetries?: number;
  timeout?: number;
  signal?: AbortSignal;
};

/** Minimal stand-in for `openai` Node SDK chat.completions surface. */
function createMockOpenAI(fixtures: readonly ChatCompletion[]) {
  let index = 0;
  return {
    chat: {
      completions: {
        async create(
          params: CreateParams,
          requestOptions: RequestOptions = {},
        ): Promise<ChatCompletion> {
          if (params && "maxRetries" in (params as object)) {
            throw new Error(
              "maxRetries must be passed in RequestOptions (2nd arg), not the chat body",
            );
          }
          if (requestOptions.maxRetries !== 0) {
            throw new Error("Recipe pins maxRetries: 0 so SDK retries stay unobserved.");
          }
          if (requestOptions.signal?.aborted) {
            const err = new Error("Request aborted");
            err.name = "AbortError";
            throw err;
          }
          const fixture = fixtures[index];
          if (fixture === undefined) {
            throw new Error(`No mock completion for call index ${index}`);
          }
          index += 1;
          return {
            ...fixture,
            model: fixture.model || params.model,
            _request_id: fixture._request_id ?? `req_http_${index}`,
          };
        },
      },
    },
  };
}

const fixtures: ChatCompletion[] = [
  {
    id: "chatcmpl-recipe-001",
    _request_id: "req_http_aaa",
    model: "gpt-4o-mini-2024-07-18",
    choices: [
      {
        finish_reason: "stop",
        message: { role: "assistant", content: "fixture one" },
      },
    ],
    usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
  },
  {
    id: "chatcmpl-recipe-002",
    _request_id: "req_http_bbb",
    model: "gpt-4o-mini-2024-07-18",
    choices: [
      {
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            { id: "call_lookup_1", type: "function", function: { name: "lookup" } },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 },
  },
  {
    id: "chatcmpl-recipe-003",
    _request_id: "req_http_ccc",
    model: "gpt-4o-mini-2024-07-18",
    choices: [
      {
        finish_reason: "stop",
        message: { role: "assistant", content: "fixture three" },
      },
    ],
    usage: { prompt_tokens: 30, completion_tokens: 6, total_tokens: 36 },
  },
];

const traceDir = path.join(process.cwd(), ".agent-inspect-runs");
await mkdir(traceDir, { recursive: true });

const memory = memoryWriter();
const disk = fileWriter({ dir: traceDir });
const writer: TraceWriter = {
  async write(event) {
    await memory.write(event);
    await disk.write(event);
  },
  async flush() {
    await memory.flush?.();
    await disk.flush?.();
  },
  async close() {
    await memory.close?.();
    await disk.close?.();
  },
};

const inspector = createInspector({
  writer,
  silent: true,
  capture: { onSuccess: "metadata-only", onError: "metadata-only" },
});
const client = createMockOpenAI(fixtures);

async function tracedChatCompletion(
  requestedModel: string,
  messages: CreateParams["messages"],
  requestOptions: RequestOptions = { maxRetries: 0 },
): Promise<ChatCompletion> {
  // Awaited SDK operation is inside the LLM span. Usage / IDs are mapped after
  // the response returns via completion attributes + return identity.
  return await inspector.llm(
    requestedModel,
    async () => {
      const response = await client.chat.completions.create(
        { model: requestedModel, messages },
        {
          maxRetries: requestOptions.maxRetries ?? 0,
          ...(requestOptions.timeout !== undefined
            ? { timeout: requestOptions.timeout }
            : {}),
          ...(requestOptions.signal !== undefined
            ? { signal: requestOptions.signal }
            : {}),
        },
      );
      return response;
    },
    {
      metadata: {
        sdkOperation: "chat.completions.create",
        requestedModel,
        maxRetries: requestOptions.maxRetries ?? 0,
        attemptDetail: "unknown",
        httpAttemptVsLogicalOp:
          "One logical SDK operation; HTTP attempts unknown when maxRetries:0",
        genAiMappingRef:
          "opentelemetry-genai-conventions (attribute names only; no OTel runtime)",
      },
    },
  );
}

const runId = "openai-node-chat-completions-recipe";
const responses: ChatCompletion[] = [];
await inspector.run(
  "openai-node-chat-completions",
  async () => {
    responses.push(
      await tracedChatCompletion("gpt-4o-mini", [
        { role: "user", content: "fixture prompt one" },
      ]),
    );
    responses.push(
      await tracedChatCompletion("gpt-4o-mini", [
        { role: "user", content: "fixture prompt two" },
      ]),
    );
    responses.push(
      await tracedChatCompletion("gpt-4o-mini", [
        { role: "user", content: "fixture prompt three" },
      ]),
    );
    return { ok: true };
  },
  { runId, traceDir },
);

await writer.flush?.();
await writer.close?.();

const events = memory.getEvents();
const llmStarts = events.filter(
  (event) =>
    event.kind === "LLM" &&
    (event.attributes as { legacyEvent?: string } | undefined)?.legacyEvent ===
      "step_started",
);
const llmCompletes = events.filter(
  (event) =>
    event.kind === "LLM" &&
    (event.attributes as { legacyEvent?: string } | undefined)?.legacyEvent ===
      "step_completed",
);
const metadatas = llmStarts.map(
  (event) =>
    ((event.attributes as { metadata?: Record<string, unknown> } | undefined)
      ?.metadata ?? {}) as Record<string, unknown>,
);

if (llmStarts.length !== 3) {
  throw new Error(`Expected 3 LLM spans, got ${llmStarts.length}`);
}
if (responses.length !== 3) {
  throw new Error(`Expected 3 caller return objects, got ${responses.length}`);
}

for (const [index, response] of responses.entries()) {
  if (response.id !== fixtures[index]!.id) {
    throw new Error(`completion resource id mismatch at ${index}`);
  }
  if (response._request_id !== fixtures[index]!._request_id) {
    throw new Error(`HTTP request id mismatch at ${index}`);
  }
  if (response.id === response._request_id) {
    throw new Error(`resource id must stay distinct from HTTP request id at ${index}`);
  }
  if (response.usage == null) {
    throw new Error(`usage missing on caller return at ${index}`);
  }
  if (metadatas[index]?.maxRetries !== 0) {
    throw new Error(`maxRetries metadata missing at ${index}`);
  }
}

if (responses[1]?.choices[0]?.message.tool_calls?.[0]?.id !== "call_lookup_1") {
  throw new Error("tool-call id link missing on second response");
}

// Completions should carry outputSummary when capture metadata-only is on.
if (llmCompletes.length !== 3) {
  throw new Error(`Expected 3 LLM completions, got ${llmCompletes.length}`);
}

const onDisk = await readdir(traceDir);
const jsonl = onDisk.find((name) => name.startsWith(runId) && name.endsWith(".jsonl"));
if (jsonl === undefined) {
  throw new Error("Expected JSONL on disk");
}
const raw = await readFile(path.join(traceDir, jsonl), "utf8");
if (!raw.includes("chat.completions.create") || !raw.includes('"maxRetries":0')) {
  throw new Error("Persisted trace missing SDK operation metadata");
}
// Completion resource id + HTTP request id remain on the caller return object.
// metadata-only capture stores a bounded shape summary, not full response bodies
// (no core enrichment API in this recipe).

const relativeEvidenceDir = path
  .relative(process.cwd(), path.join(traceDir, jsonl))
  .split(path.sep)
  .join("/");

process.stdout.write(
  [
    "OpenAI Node chat.completions recipe: pass",
    `LLM spans: ${llmStarts.length}`,
    `Completion resource ids: ${responses.map((r) => r.id).join(", ")}`,
    `HTTP request ids: ${responses.map((r) => r._request_id).join(", ")}`,
    `Tool-call link: ${String(responses[1]?.choices[0]?.message.tool_calls?.[0]?.id ?? "")}`,
    `Trace: ${relativeEvidenceDir}`,
    "Note: SDK call runs inside inspector.llm; maxRetries lives on RequestOptions.",
  ].join("\n") + "\n",
);
