/**
 * Direct OpenAI Node `chat.completions.create` capture recipe.
 *
 * Uses a local mock SDK client only — no OpenAI package, API keys, or network.
 * Maps requested/resolved model, request id, finish reason, usage, and tool-call
 * ids explicitly onto `inspector.llm` metadata. One logical SDK operation =
 * one LLM span (`maxRetries: 0`; attempt-level HTTP detail remains unknown).
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
};

type CreateParams = {
  model: string;
  messages: Array<{ role: string; content: string }>;
  maxRetries?: number;
};

/** Minimal stand-in for `openai` Node SDK chat.completions surface. */
function createMockOpenAI(fixtures: readonly ChatCompletion[]) {
  let index = 0;
  return {
    chat: {
      completions: {
        async create(params: CreateParams): Promise<ChatCompletion> {
          if (params.maxRetries !== 0) {
            throw new Error("Recipe pins maxRetries: 0 so SDK retries stay unobserved.");
          }
          const fixture = fixtures[index];
          if (fixture === undefined) {
            throw new Error(`No mock completion for call index ${index}`);
          }
          index += 1;
          return { ...fixture, model: fixture.model || params.model };
        },
      },
    },
  };
}

const fixtures: ChatCompletion[] = [
  {
    id: "chatcmpl-recipe-001",
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

const inspector = createInspector({ writer, silent: true });
const client = createMockOpenAI(fixtures);

async function tracedChatCompletion(
  requestedModel: string,
  messages: CreateParams["messages"],
): Promise<ChatCompletion> {
  // Explicit metadata mapping — step.llm does not auto-extract OpenAI usage.
  // Usage/request ids are known from the mock response before the span closes.
  let response!: ChatCompletion;
  response = await client.chat.completions.create({
    model: requestedModel,
    messages,
    maxRetries: 0,
  });
  await inspector.llm(requestedModel, async () => response, {
    metadata: {
      sdkOperation: "chat.completions.create",
      requestedModel,
      resolvedModel: response.model,
      requestId: response.id,
      finishReason: response.choices[0]?.finish_reason,
      usage: response.usage ?? null,
      toolCallIds:
        response.choices[0]?.message.tool_calls?.map((call) => call.id) ?? [],
      maxRetries: 0,
      attemptDetail: "unknown",
      genAiMappingRef: "opentelemetry-genai-conventions (attribute names only; no OTel runtime)",
    },
  });
  return response;
}

const runId = "openai-node-chat-completions-recipe";
await inspector.run(
  "openai-node-chat-completions",
  async () => {
    await tracedChatCompletion("gpt-4o-mini", [
      { role: "user", content: "fixture prompt one" },
    ]);
    await tracedChatCompletion("gpt-4o-mini", [
      { role: "user", content: "fixture prompt two" },
    ]);
    await tracedChatCompletion("gpt-4o-mini", [
      { role: "user", content: "fixture prompt three" },
    ]);
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
const metadatas = llmStarts.map(
  (event) =>
    ((event.attributes as { metadata?: Record<string, unknown> } | undefined)
      ?.metadata ?? {}) as Record<string, unknown>,
);

if (llmStarts.length !== 3) {
  throw new Error(`Expected 3 LLM spans, got ${llmStarts.length}`);
}
for (const [index, meta] of metadatas.entries()) {
  if (meta.requestId !== fixtures[index]!.id) {
    throw new Error(`requestId mismatch at ${index}`);
  }
  if (meta.usage == null) {
    throw new Error(`usage missing at ${index}`);
  }
}
if (!Array.isArray(metadatas[1]?.toolCallIds) || metadatas[1]!.toolCallIds[0] !== "call_lookup_1") {
  throw new Error("tool-call id link missing on second span");
}

const onDisk = await readdir(traceDir);
const jsonl = onDisk.find((name) => name.startsWith(runId) && name.endsWith(".jsonl"));
if (jsonl === undefined) {
  throw new Error("Expected JSONL on disk");
}
const raw = await readFile(path.join(traceDir, jsonl), "utf8");
if (!raw.includes("chatcmpl-recipe-001")) {
  throw new Error("Persisted trace missing request id");
}

const relativeEvidenceDir = path
  .relative(process.cwd(), path.join(traceDir, jsonl))
  .split(path.sep)
  .join("/");

process.stdout.write(
  [
    "OpenAI Node chat.completions recipe: pass",
    `LLM spans: ${llmStarts.length}`,
    `Request ids: ${metadatas.map((m) => m.requestId).join(", ")}`,
    `Tool-call link: ${String((metadatas[1]?.toolCallIds as string[])?.[0] ?? "")}`,
    `Trace: ${relativeEvidenceDir}`,
    "Note: explain/what are local-only; this recipe performs no provider calls.",
  ].join("\n") + "\n",
);
