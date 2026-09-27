# Recipe: OpenAI Node chat.completions (mock)

## What this demonstrates

Explicit capture around the consumer's non-streaming `chat.completions.create`
path using `createInspector` + `inspector.llm`, without adding an OpenAI SDK
dependency to AgentInspect core.

- Mock OpenAI Node client (no network, no API key)
- One logical SDK operation → one LLM span
- Explicit metadata: requested/resolved model, `requestId`, finish reason,
  usage, tool-call ids
- Pins `maxRetries: 0` so HTTP attempt detail stays `attemptDetail: "unknown"`
- Caller return objects are preserved; bodies stay opt-in (metadata-only)

`step.llm` / `inspector.llm` do **not** auto-extract OpenAI usage — this recipe
maps fields after the mock response is known.

## How to run

```bash
pnpm build
pnpm --filter agent-inspect-recipe-openai-node-chat-completions start
```

## Expected output

See `expected-output.txt`.

## Notes

- Streaming, live credentials, and OTel exporters are out of scope for this recipe.
- GenAI attribute names are a versioned mapping reference only — no OpenTelemetry
  runtime dependency and no standards-conformance claim.
