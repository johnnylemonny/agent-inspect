/**
 * Maintained OpenAI boundary controls (local mock transport — no network).
 * Timing, provider error, timeout, and cancellation must produce LLM error/success spans.
 * Persisted response id/usage in JSONL remains deferred (caller-return only).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInspector } from "agent-inspect/advanced";
import { memoryWriter } from "agent-inspect/writers";

function createTransportClient(behavior) {
  return {
    chat: {
      completions: {
        async create(_params, requestOptions = {}) {
          if (requestOptions.maxRetries !== 0) {
            throw new Error("maxRetries must be 0 in this control");
          }
          if (behavior === "abort") {
            if (requestOptions.signal?.aborted) {
              const err = new Error("Request aborted");
              err.name = "AbortError";
              throw err;
            }
            throw new Error("expected aborted signal");
          }
          if (behavior === "timeout") {
            const err = new Error("Request timed out");
            err.name = "APIConnectionTimeoutError";
            throw err;
          }
          if (behavior === "server-error") {
            const err = new Error("502 Bad Gateway");
            err.name = "APIError";
            throw err;
          }
          if (behavior === "delayed") {
            await new Promise((r) => setTimeout(r, 60));
            return {
              id: "chatcmpl-delayed",
              _request_id: "req_delayed",
              model: "gpt-4o-mini",
              choices: [{ finish_reason: "stop", message: { role: "assistant", content: "ok" } }],
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            };
          }
          throw new Error(`unknown behavior ${behavior}`);
        },
      },
    },
  };
}

async function runBoundary(behavior) {
  const memory = memoryWriter();
  const inspector = createInspector({
    writer: memory,
    silent: true,
    capture: { onSuccess: "metadata-only", onError: "metadata-only" },
  });
  const client = createTransportClient(behavior);
  const started = Date.now();
  let threw = false;
  try {
    await inspector.run(
      `openai-boundary-${behavior}`,
      async () => {
        await inspector.llm(
          "gpt-4o-mini",
          async () => {
            const ac = new AbortController();
            if (behavior === "abort") ac.abort();
            return client.chat.completions.create(
              { model: "gpt-4o-mini", messages: [{ role: "user", content: "x" }] },
              { maxRetries: 0, signal: ac.signal, timeout: 1 },
            );
          },
          { metadata: { sdkOperation: "chat.completions.create", boundaryControl: behavior } },
        );
      },
      { runId: `openai-boundary-${behavior}`, silent: true },
    );
  } catch {
    threw = true;
  }
  await memory.flush?.();
  const events = memory.getEvents();
  const llm = events.filter((e) => e.kind === "LLM");
  const elapsed = Date.now() - started;
  return { threw, llm, elapsed, events };
}

describe("openai boundary local transport controls", () => {
  it("records delayed success inside an LLM span with measurable duration", async () => {
    const { threw, llm, elapsed } = await runBoundary("delayed");
    assert.equal(threw, false);
    assert.ok(llm.length >= 1);
    assert.ok(elapsed >= 50, `expected delay reflected in wall time, got ${elapsed}ms`);
  });

  it("records provider error as a failed LLM path", async () => {
    const { threw, llm } = await runBoundary("server-error");
    assert.equal(threw, true);
    assert.ok(llm.length >= 1);
  });

  it("records timeout as a failed LLM path", async () => {
    const { threw, llm } = await runBoundary("timeout");
    assert.equal(threw, true);
    assert.ok(llm.length >= 1);
  });

  it("records cancellation as a failed LLM path", async () => {
    const { threw, llm } = await runBoundary("abort");
    assert.equal(threw, true);
    assert.ok(llm.length >= 1);
  });
});
