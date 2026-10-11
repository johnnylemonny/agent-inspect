import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectRun } from "agent-inspect";

import {
  resetMcpToolCallIdsForTests,
  resolveCallToolArgs,
  wrapMcpClient,
} from "../src/wrap.js";

describe("@agent-inspect/mcp request options", () => {
  let traceDir: string;

  beforeEach(async () => {
    resetMcpToolCallIdsForTests();
    traceDir = await mkdtemp(path.join(os.tmpdir(), "agent-inspect-mcp-opts-"));
  });

  afterEach(async () => {
    await rm(traceDir, { recursive: true, force: true });
  });

  it("resolveCallToolArgs forwards third-arg RequestOptions with signal/timeout", () => {
    const signal = AbortSignal.abort();
    const resolved = resolveCallToolArgs(undefined, {
      signal,
      timeout: 1000,
    });
    expect(resolved.resultSchema).toBeUndefined();
    expect(resolved.requestOptions?.signal).toBe(signal);
    expect(resolved.requestOptions?.timeout).toBe(1000);
    expect(resolved.callMetadata).toEqual({});
  });

  it("resolveCallToolArgs peels AgentInspect metadata without consuming SDK options", () => {
    const twoArg = resolveCallToolArgs({ metadata: { attemptId: "a1" } });
    expect(twoArg.resultSchema).toBeUndefined();
    expect(twoArg.requestOptions).toBeUndefined();
    expect(twoArg.callMetadata).toEqual({ attemptId: "a1" });

    const schema = { parse: () => ({}) };
    const withSchema = resolveCallToolArgs(schema, {
      metadata: { attemptId: "a2" },
    });
    expect(withSchema.resultSchema).toBe(schema);
    expect(withSchema.callMetadata).toEqual({ attemptId: "a2" });
    expect(withSchema.requestOptions).toBeUndefined();

    // SDK options that include onprogress must not be treated as AI metadata bags.
    const onprogress = vi.fn();
    const sdk = resolveCallToolArgs(undefined, { onprogress, timeout: 50 });
    expect(sdk.requestOptions?.onprogress).toBe(onprogress);
    expect(sdk.callMetadata).toEqual({});
  });

  it("forwards pre-aborted signal so underlying callTool is still invoked with options", async () => {
    const controller = new AbortController();
    controller.abort(new Error("caller cancelled before request"));
    const callTool = vi.fn(async (_params, _schema, options) => {
      if (options?.signal?.aborted) {
        throw options.signal.reason ?? new Error("aborted");
      }
      return { content: [{ type: "text", text: "executed" }] };
    });
    const client = wrapMcpClient({ callTool });

    await expect(
      inspectRun(
        "mcp-preabort",
        async () =>
          client.callTool(
            { name: "probe", arguments: {} },
            undefined,
            { signal: controller.signal, timeout: 1000 },
          ),
        { silent: true, traceDir },
      ),
    ).rejects.toThrow(/cancelled|aborted/i);

    expect(callTool).toHaveBeenCalledTimes(1);
    const opts = callTool.mock.calls[0]?.[2] as { signal?: AbortSignal };
    expect(opts?.signal?.aborted).toBe(true);
  });

  it("forwards listTools RequestOptions", async () => {
    const listTools = vi.fn(async (_params, options) => {
      expect(options?.timeout).toBe(42);
      return { tools: [] };
    });
    const client = wrapMcpClient({
      listTools,
      async callTool() {
        return { content: [] };
      },
    });

    await inspectRun(
      "mcp-list-opts",
      async () => {
        await client.listTools?.({}, { timeout: 42 });
      },
      { silent: true, traceDir },
    );
    expect(listTools).toHaveBeenCalledWith({}, { timeout: 42 });
  });

  it("forwards onprogress callback through callTool options", async () => {
    const onprogress = vi.fn();
    const callTool = vi.fn(async (_p, _s, options) => {
      options?.onprogress?.({ progress: 1, total: 2 });
      return { content: [{ type: "text", text: "ok" }] };
    });
    const client = wrapMcpClient({ callTool });

    await inspectRun(
      "mcp-progress",
      async () =>
        client.callTool({ name: "echo", arguments: {} }, undefined, {
          onprogress,
        }),
      { silent: true, traceDir },
    );
    expect(onprogress).toHaveBeenCalled();
  });

  it("preserves application errors when instrumentation records the step", async () => {
    const callTool = vi.fn(async (_params) => {
      throw new Error("mcp boom");
    });
    const client = wrapMcpClient({ callTool });
    await expect(
      inspectRun(
        "mcp-app-error",
        async () => client.callTool({ name: "boom", arguments: {} }),
        { silent: true, traceDir },
      ),
    ).rejects.toThrow(/mcp boom/);

    const files = (await readdir(traceDir)).filter((f) => f.endsWith(".jsonl"));
    const text = await readFile(path.join(traceDir, files[0]!), "utf8");
    expect(text).toContain("mcp:boom");
  });

  it("keeps overlapping calls in distinct runs with distinct toolCallIds", async () => {
    const callTool = vi.fn(async ({ arguments: args }) => ({
      content: [{ type: "text", text: JSON.stringify(args) }],
    }));
    const client = wrapMcpClient(
      { callTool },
      { toolCallIdPrefix: "ov", serverName: "overlap" },
    );

    const dirA = path.join(traceDir, "run-a");
    const dirB = path.join(traceDir, "run-b");
    await Promise.all([
      inspectRun(
        "overlap-a",
        async () => client.callTool({ name: "echo", arguments: { n: 1 } }),
        { silent: true, traceDir: dirA },
      ),
      inspectRun(
        "overlap-b",
        async () => client.callTool({ name: "echo", arguments: { n: 2 } }),
        { silent: true, traceDir: dirB },
      ),
    ]);

    async function starts(dir: string) {
      const files = (await readdir(dir)).filter((f) => f.endsWith(".jsonl"));
      const lines = (await readFile(path.join(dir, files[0]!), "utf8"))
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as { event?: string; name?: string; metadata?: { toolCallId?: string }; runId?: string });
      return lines.filter((e) => e.event === "step_started" && e.name === "mcp:echo");
    }

    const a = await starts(dirA);
    const b = await starts(dirB);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0]!.runId).not.toEqual(b[0]!.runId);
    expect(a[0]!.metadata?.toolCallId).toBeTruthy();
    expect(b[0]!.metadata?.toolCallId).toBeTruthy();
    expect(a[0]!.metadata?.toolCallId).not.toEqual(b[0]!.metadata?.toolCallId);
  });
});
