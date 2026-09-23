import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { version as packageVersion } from "../../../package.json";

export type InitFramework =
  | "ai-sdk"
  | "openai-agents"
  | "langchain"
  | "langgraph"
  | "custom";

export interface InitCommandOptions {
  /** Framework id or alias (`observe` / `manual` → `custom`). */
  framework?: string;
  ci?: "github";
  dryRun?: boolean;
  yes?: boolean;
  json?: boolean;
  cwd?: string;
}

export interface InitPlannedFile {
  path: string;
  action: "create" | "skip";
  reason?: string;
}

export interface InitPlan {
  framework: InitFramework;
  ci?: "github";
  files: InitPlannedFile[];
}

const CONFIG_FILE = "agent-inspect.config.ts";
const TRACE_DIR = ".agent-inspect";
const GITKEEP = ".agent-inspect/.gitkeep";

function normalizeFramework(value: string | undefined): InitFramework {
  const raw = (value ?? "custom").trim();
  if (raw === "observe" || raw === "manual") {
    return "custom";
  }
  if (
    raw === "ai-sdk" ||
    raw === "openai-agents" ||
    raw === "langchain" ||
    raw === "langgraph" ||
    raw === "custom"
  ) {
    return raw;
  }
  throw new Error(
    "Unsupported --framework value. Use ai-sdk, openai-agents, langchain, langgraph, custom, observe, or manual.",
  );
}

function configTemplate(framework: InitFramework): string {
  const base = `/**
 * AgentInspect local config (metadata-only capture by default).
 * See https://github.com/rajudandigam/agent-inspect/blob/main/docs/SAFE-TRACE-SHARING.md
 */
export const agentInspectConfig = {
  traceDir: ".agent-inspect",
  enabled: process.env.AGENT_INSPECT !== "0",
  redactionProfile: "local" as const,
};
`;
  if (framework === "custom") return base;
  return `${base}
export const framework = "${framework}" as const;
`;
}

function demoTemplate(framework: InitFramework): string {
  switch (framework) {
    case "ai-sdk":
      return `/**
 * AI SDK starter — keyless MockLanguageModelV3 + @agent-inspect/ai-sdk telemetry.
 * Install: npm install agent-inspect @agent-inspect/ai-sdk ai@6.0.210 zod
 */
import { generateText, stepCountIs, tool } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { agentInspect } from "@agent-inspect/ai-sdk";
import { z } from "zod";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const TRACE_DIR = ".agent-inspect";
const ANSWER = "You have 2 orders";
const CORRECT_RUN = "ai-sdk-demo-correct";
const WRONG_RUN = "ai-sdk-demo-wrong";

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
  description: "Delete orders for a user (wrong path)",
  inputSchema: z.object({ userId: z.string() }),
  execute: async () => ({ orders: 2 }),
});

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
                  toolCallId: \`call-\${toolName}\`,
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
      tools: { lookup_orders: lookupOrders, delete_orders: deleteOrders },
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
      throw new Error(\`unexpected answer for \${runName}: \${result.text}\`);
    }
  } finally {
    await integration.flush();
    await integration.close();
  }
}

function selectRunIdByName(runName) {
  const files = readdirSync(TRACE_DIR).filter((f) => f.endsWith(".jsonl"));
  const matches = [];
  for (const file of files) {
    const text = readFileSync(path.join(TRACE_DIR, file), "utf8");
    if (text.includes(\`"name":"\${runName}"\`) || text.includes(\`"name": "\${runName}"\`)) {
      matches.push(file.replace(/\\.jsonl$/, ""));
    }
  }
  if (matches.length !== 1) {
    throw new Error(
      \`expected exactly one run named \${runName}, found \${matches.length}\`,
    );
  }
  return matches[0];
}

async function main() {
  await runPath(CORRECT_RUN, "lookup_orders");
  await runPath(WRONG_RUN, "delete_orders");
  const correctId = selectRunIdByName(CORRECT_RUN);
  const wrongId = selectRunIdByName(WRONG_RUN);
  console.log("Trace written to .agent-inspect/");
  console.log(\`Correct path runId: \${correctId}\`);
  console.log(\`Wrong path runId:   \${wrongId}\`);
  console.log(\`Next: npx agent-inspect check \${correctId} --required-tool lookup_orders\`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;
    case "openai-agents":
      return `/**
 * OpenAI Agents starter — use @agent-inspect/openai-agents for local-only processors.
 * This demo uses manual steps (no API keys).
 */
import { inspectRun, step } from "agent-inspect";

async function main() {
  await inspectRun("openai-agents-demo", async () => {
    await step.tool("mock-agent-run", async () => "ok");
  }, { traceDir: ".agent-inspect", silent: true });
  console.log("Trace written to .agent-inspect/");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;
    case "langchain":
      return `/**
 * LangChain starter — wire @agent-inspect/langchain callbacks in your app.
 * This demo uses manual steps (no API keys).
 */
import { inspectRun, step } from "agent-inspect";

async function main() {
  await inspectRun("langchain-demo", async () => {
    await step.tool("mock-chain", async () => "ok");
  }, { traceDir: ".agent-inspect", silent: true });
  console.log("Trace written to .agent-inspect/");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;
    case "langgraph":
      return `/**
 * LangGraph onboarding starter — no provider keys.
 * Prefer @agent-inspect/langchain callbacks with your StateGraph in app code.
 * This demo writes a bridged tool lifecycle you can check/gate locally.
 */
import { inspectRun, step } from "agent-inspect";

async function main() {
  await inspectRun("langgraph-demo", async () => {
    await step("chain:agent", async () => {
      await step.tool("lookup_orders", async () => ({ orders: 0 }));
      return { ok: true };
    });
  }, { traceDir: ".agent-inspect", silent: true });
  console.log("Trace written to .agent-inspect/");
  console.log("Next: npx agent-inspect check <run-id> --required-tool lookup_orders");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;
    default:
      return `import { observe } from "agent-inspect";

class DemoAgent {
  async run(input) {
    return { answer: \`Echo: \${input.question}\` };
  }
}

const agent = observe(new DemoAgent(), {
  traceDir: ".agent-inspect",
  silent: true,
});

await agent.run({ question: "hello" });
console.log("Trace written to .agent-inspect/");
`;
  }
}

function githubWorkflowTemplate(demoPath: string): string {
  return `name: AgentInspect artifacts

on:
  workflow_dispatch:
  push:
    branches: [main]

jobs:
  trace-artifacts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - run: npm ci
      - name: Run deterministic agent fixture
        run: node ${demoPath}
      - name: Trajectory check with Evidence on failure
        run: >
          npx --yes agent-inspect check --dir .agent-inspect
          --preset trajectory
          --evidence-on fail
          --evidence-profile share
          --evidence-format directory
      - name: Verify share safety
        if: always()
        run: npx --yes agent-inspect verify-safe . --dir .agent-inspect
      - name: Upload AgentInspect traces and Evidence
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: agent-inspect-traces
          path: |
            .agent-inspect/**/*.jsonl
            .agent-inspect/evidence/**
          if-no-files-found: ignore
`;
}


export async function planInit(options: InitCommandOptions = {}): Promise<InitPlan> {
  const framework = normalizeFramework(options.framework);
  const cwd = path.resolve(options.cwd ?? process.cwd());
  // Planned-file paths are a display/JSON contract; keep them POSIX-style on
  // every platform like the other candidates (filesystem access still goes
  // through path.join(cwd, rel), which accepts forward slashes on Windows).
  const demoPath =
    framework === "custom"
      ? "examples/agent-inspect-demo.mjs"
      : `examples/agent-inspect-${framework}-demo.mjs`;

  const candidates: Array<{ rel: string; content: string }> = [
    { rel: CONFIG_FILE, content: configTemplate(framework) },
    { rel: GITKEEP, content: "" },
    { rel: demoPath, content: demoTemplate(framework) },
  ];

  if (options.ci === "github") {
    candidates.push({
      rel: ".github/workflows/agent-inspect-artifacts.yml",
      content: githubWorkflowTemplate(demoPath),
    });
  }

  const files: InitPlannedFile[] = [];
  for (const candidate of candidates) {
    const abs = path.join(cwd, candidate.rel);
    try {
      await access(abs);
      files.push({
        path: candidate.rel,
        action: "skip",
        reason: "file already exists",
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      files.push({ path: candidate.rel, action: "create" });
    }
  }

  return { framework, ...(options.ci ? { ci: options.ci } : {}), files };
}

async function writePlannedFiles(
  plan: InitPlan,
  cwd: string,
  options: InitCommandOptions,
): Promise<string[]> {
  const written: string[] = [];
  for (const entry of plan.files) {
    if (entry.action === "skip") {
      continue;
    }

    const abs = path.join(cwd, entry.path);
    if (options.dryRun) {
      written.push(entry.path);
      continue;
    }

    await mkdir(path.dirname(abs), { recursive: true });
    const demoPath =
      plan.framework === "custom"
        ? "examples/agent-inspect-demo.mjs"
        : `examples/agent-inspect-${plan.framework}-demo.mjs`;
    const content =
      entry.path === CONFIG_FILE
        ? configTemplate(plan.framework)
        : entry.path === GITKEEP
          ? ""
          : entry.path.endsWith(".yml")
            ? githubWorkflowTemplate(demoPath)
            : demoTemplate(plan.framework);
    await writeFile(abs, content, "utf-8");
    written.push(entry.path);
  }
  return written;
}

export async function initCommand(options: InitCommandOptions = {}): Promise<void> {
  const cwd = path.resolve(options.cwd ?? process.cwd());

  try {
    const plan = await planInit({ ...options, cwd });
    const toWrite = plan.files.filter((file) => file.action === "create").map((f) => f.path);
    const skipped = plan.files.filter((file) => file.action === "skip");

    if (options.json) {
      const payload = {
        ok: true,
        version: packageVersion,
        framework: plan.framework,
        ci: plan.ci ?? null,
        dryRun: options.dryRun === true,
        planned: plan.files,
        wouldWrite: options.dryRun ? toWrite : undefined,
      };
      console.log(JSON.stringify(payload, null, 2));
      if (options.dryRun) return;
    }

    const written = await writePlannedFiles(plan, cwd, options);

    if (!options.json) {
      console.log("AgentInspect init");
      console.log(`Framework: ${plan.framework}`);
      console.log(`Trace directory: ${TRACE_DIR}/`);
      if (options.dryRun) {
        console.log("Dry run — would create:");
        for (const file of toWrite) console.log(`- ${file}`);
        for (const file of skipped) {
          console.log(`- ${file.path} (skip: ${file.reason ?? "exists"})`);
        }
        return;
      }
      console.log("Created:");
      for (const file of written) console.log(`- ${file}`);
      for (const file of skipped) {
        console.log(`- ${file.path} (skipped: ${file.reason ?? "exists"})`);
      }
      console.log("\nNext: run your demo, then `npx agent-inspect list --dir .agent-inspect`");
      console.log("No dependencies were installed. Add packages manually when ready.");
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (options.json) {
      console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
    } else {
      console.error(`[AgentInspect] init failed: ${msg}`);
    }
    process.exitCode = 1;
  }
}

export async function readInitConfig(cwd: string): Promise<string | undefined> {
  try {
    return await readFile(path.join(cwd, CONFIG_FILE), "utf8");
  } catch {
    return undefined;
  }
}
