# AI SDK adoption guide

Blessed path for **Vercel AI SDK** + AgentInspect — local traces only, metadata-first by default.

**Peer:** `ai@^6.0.0` — tested with **`ai@6.0.210`**. This guide does not claim AI SDK 7 support.

## Install

```bash
npm install agent-inspect @agent-inspect/ai-sdk ai@6.0.210
```

Or bootstrap a project:

```bash
npx agent-inspect init --framework ai-sdk
```

## Minimal `generateText`

```ts
import { generateText } from "ai";
import { agentInspect } from "@agent-inspect/ai-sdk";

const integration = agentInspect({
  traceDir: ".agent-inspect",
  runName: "support-agent",
  capture: "metadata-only",
});

try {
  await generateText({
    model: yourModel,
    prompt: "Hello",
    experimental_telemetry: {
      isEnabled: true,
      recordInputs: false,
      recordOutputs: false,
      integrations: [integration],
    },
  });
} finally {
  await integration.flush();
  await integration.close();
}
```

Pass the integration only through `experimental_telemetry.integrations`. AgentInspect does **not** expose `getTelemetryMetadata()` or `getTelemetryHandlers()`.

## `streamText` (metadata-only)

```ts
import { streamText } from "ai";
import { agentInspect } from "@agent-inspect/ai-sdk";

const integration = agentInspect({
  traceDir: ".agent-inspect",
  runName: "stream-demo",
  capture: "metadata-only",
});

try {
  const result = streamText({
    model: yourModel,
    prompt: "Hello",
    experimental_telemetry: {
      isEnabled: true,
      recordInputs: false,
      recordOutputs: false,
      integrations: [integration],
    },
  });

  for await (const _chunk of result.textStream) {
    // consume stream
  }
} finally {
  await integration.flush();
  await integration.close();
}
```

Streaming lifecycle metadata is captured; raw token streams are not persisted by default.

## Concurrent generations

Create a **new** `agentInspect()` instance for each concurrent generation. Do not share one integration across overlapping `generateText` / `streamText` calls.

## Diagnostics

```ts
const d = integration.getDiagnostics();
console.log(d.writeFailures, d.lifecycleWarnings, d.lastWarning, d.capture);
```

Use `onDiagnostic` in options for live callbacks. Failures degrade locally; they do not throw into your agent return path.

## Tool calls

Tool spans appear when the model invokes tools. Keep `recordInputs` / `recordOutputs` false unless you explicitly accept content capture risk.

## Next.js route handler

See [examples/recipes/ai-sdk-next-route](../../examples/recipes/ai-sdk-next-route/) — one `agentInspect()` integration per request, no network, metadata-only defaults.

## Privacy controls

| Setting | Required default | Why |
| ------- | ---------------- | --- |
| `recordInputs: false` | yes | Prevents AI SDK from recording prompts into telemetry payloads |
| `recordOutputs: false` | yes | Prevents model output capture in telemetry |
| `capture: "metadata-only"` | yes (adapter) | AgentInspect adapter redacts/bounds persisted fields |

Opting into `capture: "preview"` persists bounded, redacted `*Preview` attributes
for prompt, message, text, and tool payload fields. Tune it with
`maxPreviewChars`, raise `redactionProfile` to `share` or `strict` for stricter
bounds, and observe `AI_CAPTURE_FIELD_UNAVAILABLE` /
`AI_CAPTURE_PREVIEW_TRUNCATED` / `AI_CAPTURE_PREVIEW_REDACTED` through
`onDiagnostic` or `getDiagnostics().capture`. Preview traces can still contain
sensitive free text; redact before sharing. Full contract:
[ADAPTERS.md](./ADAPTERS.md#shared-adapter-capture-contract-preview).

## Inspect locally

```bash
npx agent-inspect list --dir .agent-inspect
npx agent-inspect view <run-id> --dir .agent-inspect --summary
npx agent-inspect check <run-id> --dir .agent-inspect --preset trajectory
npx agent-inspect verify-safe <run-id> --dir .agent-inspect
npx agent-inspect bundle <run-id> --dir .agent-inspect --profile share --out ./evidence
npx agent-inspect bundle verify ./evidence
```

Use `--fail-on-observation` only when the run records explicit OUTCOME events.

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| No trace file | Ensure `experimental_telemetry.isEnabled: true` and `integrations: [integration]` |
| Empty trace | Confirm `AGENT_INSPECT` is not `0` |
| Prompts in trace | Set `recordInputs: false` and `recordOutputs: false` on the AI SDK call |
| Wrong directory | Pass `traceDir` to `agentInspect()` or set `AGENT_INSPECT_TRACE_DIR` |
| Mixed concurrent runs | Use a separate `agentInspect()` instance per overlapping generation |

## Recipes (no network)

- [ai-sdk-local-telemetry](../../examples/recipes/ai-sdk-local-telemetry/)
- [ai-sdk-next-route](../../examples/recipes/ai-sdk-next-route/)

## No-key packed consumer check

After building the repository, run the clean packed-consumer path directly:

```bash
pnpm build
node scripts/packed-ai-sdk-e2e.mjs
```

The same check participates in `pnpm pack:smoke`. It installs the packed root
and `@agent-inspect/ai-sdk` tarballs with the supported `ai` peer in a clean
temporary consumer, then verifies provider-independent telemetry integration
through a deterministic AI SDK mock model. It uses no provider package, API
key, or live provider call, and asserts that metadata-only evidence excludes
the fixture prompt and output.

See also [ADAPTERS.md](./ADAPTERS.md) and [ADAPTER-CONFORMANCE.md](./ADAPTER-CONFORMANCE.md).
