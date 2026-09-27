/**
 * Promptfoo 0.118.17 file provider — constructible class with id() + callApi().
 * Same final answer for correct and wrong tool paths; binds exact run names.
 */
import { inspectRun, step } from "agent-inspect";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRACE_DIR = path.join(__dirname, ".agent-inspect-runs");
const ANSWER = "You have 2 orders";

export default class AgentInspectTrajectoryProvider {
  constructor(options = {}) {
    this.providerId = options.id ?? "agent-inspect-trajectory";
    this.config = options.config ?? {};
  }

  id() {
    return this.providerId;
  }

  /**
   * @param {string} _prompt
   * @param {{ vars?: { path?: string } }} context
   */
  async callApi(_prompt, context = {}) {
    const pathKind = context.vars?.path === "wrong" ? "wrong" : "correct";
    const session = randomUUID().slice(0, 8);
    const runName =
      pathKind === "wrong"
        ? `promptfoo-wrong-path-${session}`
        : `promptfoo-correct-path-${session}`;
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
      metadata: {
        agentInspectRunName: runName,
        agentInspectTraceDir: TRACE_DIR,
        agentInspectTool: toolName,
      },
    };
  }
}
