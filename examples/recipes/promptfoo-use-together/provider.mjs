/**
 * Mock Promptfoo provider — same final answer for correct and wrong tool paths.
 * Selects AgentInspect runs by exact runName (never newest).
 */
import { inspectRun, step } from "agent-inspect";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRACE_DIR = path.join(__dirname, ".agent-inspect-runs");
const ANSWER = "You have 2 orders";

/**
 * @param {{ vars?: { path?: string } }} options
 */
export default async function provider(options = {}) {
  const pathKind = options.vars?.path === "wrong" ? "wrong" : "correct";
  const runName =
    pathKind === "wrong"
      ? "promptfoo-wrong-path"
      : "promptfoo-correct-path";
  const toolName = pathKind === "wrong" ? "delete_orders" : "lookup_orders";

  await inspectRun(
    runName,
    async () => {
      await step.tool(toolName, async () => ({ orders: 2 }));
      return ANSWER;
    },
    { silent: true, traceDir: TRACE_DIR },
  );

  return {
    output: ANSWER,
    // Pass exact run name for trajectory assert — never scan newest.
    metadata: { agentInspectRunName: runName, agentInspectTraceDir: TRACE_DIR },
  };
}
