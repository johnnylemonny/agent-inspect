/**
 * Keyless AI SDK starter — MockLanguageModelV3 only (no API keys).
 * Correct and wrong tool paths produce the same final answer; select runs by exact runName.
 *
 * Install (outside monorepo): npm install agent-inspect @agent-inspect/ai-sdk ai@6.0.210 zod
 */
import { generateText, stepCountIs, tool } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { agentInspect } from "@agent-inspect/ai-sdk";
import { z } from "zod";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const TRACE_DIR = ".agent-inspect";
const ANSWER = "You have 2 orders";
const CORRECT_RUN = "ai-sdk-starter-correct";
const WRONG_RUN = "ai-sdk-starter-wrong";

const usage = {
  inputTokens: { total: 4, noCache: 4, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 3, text: 3, reasoning: 0 },
};

const lookupOrders = tool({
  description: "Look up orders for a user",
  inputSchema: z.object({ userId: z.string() }),
  execute: async () => ({ orders: 2 }),
});

const deleteOrders = tool({
  description: "Delete orders for a user (wrong path for this question)",
  inputSchema: z.object({ userId: z.string() }),
  execute: async () => ({ orders: 2 }),
});

/**
 * @param {string} runName
 * @param {"lookup_orders" | "delete_orders"} toolName
 */
async function runPath(runName, toolName) {
  const integration = agentInspect({
    traceDir: TRACE_DIR,
    runName,
    capture: "metadata-only",
  });

  let step = 0;
  try {
    const result = await generateText({
      model: new MockLanguageModelV3({
        provider: "fixture-provider",
        modelId: "fixture-tools",
        doGenerate: async () => {
          step += 1;
          if (step === 1) {
            return {
              content: [
                {
                  type: "tool-call",
                  toolCallId: `call-${toolName}`,
                  toolName,
                  input: { userId: "u1" },
                },
              ],
              finishReason: { unified: "tool-calls", raw: "tool-calls" },
              usage,
              warnings: [],
            };
          }
          return {
            content: [{ type: "text", text: ANSWER }],
            finishReason: { unified: "stop", raw: "stop" },
            usage,
            warnings: [],
          };
        },
      }),
      tools: {
        lookup_orders: lookupOrders,
        delete_orders: deleteOrders,
      },
      prompt: "How many orders do I have?",
      stopWhen: stepCountIs(5),
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: false,
        recordOutputs: false,
        integrations: [integration],
      },
    });

    if (result.text !== ANSWER) {
      throw new Error(`unexpected answer for ${runName}: ${result.text}`);
    }
  } finally {
    await integration.flush();
    await integration.close();
  }
}

/** Select by exact runName attribute — never "newest file". */
function selectRunIdByName(runName) {
  const files = readdirSync(TRACE_DIR).filter((f) => f.endsWith(".jsonl"));
  const matches = [];
  for (const file of files) {
    const text = readFileSync(path.join(TRACE_DIR, file), "utf8");
    if (text.includes(`"name":"${runName}"`) || text.includes(`"name": "${runName}"`)) {
      matches.push(file.replace(/\.jsonl$/, ""));
    }
  }
  if (matches.length !== 1) {
    throw new Error(
      `expected exactly one run named ${runName}, found ${matches.length}: ${matches.join(", ")}`,
    );
  }
  return matches[0];
}

await runPath(CORRECT_RUN, "lookup_orders");
await runPath(WRONG_RUN, "delete_orders");

const correctId = selectRunIdByName(CORRECT_RUN);
const wrongId = selectRunIdByName(WRONG_RUN);

console.log("AI SDK starter complete (same answer, different tool paths).");
console.log(`Trace directory: ${TRACE_DIR}`);
console.log(`Correct path runId: ${correctId} (tool: lookup_orders)`);
console.log(`Wrong path runId:   ${wrongId} (tool: delete_orders)`);
console.log("");
console.log("Inspect exact runs (do not use newest):");
console.log(`  npx agent-inspect view ${correctId} --dir ${TRACE_DIR} --summary`);
console.log(`  npx agent-inspect view ${wrongId} --dir ${TRACE_DIR} --summary`);
console.log(
  `  npx agent-inspect check ${correctId} --dir ${TRACE_DIR} --required-tool lookup_orders`,
);
