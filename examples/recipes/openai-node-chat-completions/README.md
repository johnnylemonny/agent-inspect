# Recipe: OpenAI Node chat.completions (mock)

## What this demonstrates

Explicit capture around the consumer's non-streaming `chat.completions.create`
path using `createInspector` + `inspector.llm`, without adding an OpenAI SDK
dependency to AgentInspect core.

- Mock OpenAI Node client (no network, no API key)
- **Awaited SDK call runs inside** `inspector.llm` (one logical operation = one span)
- SDK transport options (`maxRetries`, `timeout`, `signal`) on the **RequestOptions**
  argument (2nd parameter), not the chat body
- HTTP request id (`_request_id`) kept distinct from completion resource id (`chatcmpl-…`)
- Pins `maxRetries: 0` so HTTP attempt detail stays `attemptDetail: "unknown"`
- Caller return objects and errors preserved; bodies stay opt-in (metadata-only capture)

`step.llm` / `inspector.llm` do **not** auto-extract OpenAI usage into persisted
JSONL — usage and response/request ids remain on the returned completion object
(boundary capture). Maintained local transport controls live in
`openai-boundary.test.mjs` (delay / error / timeout / cancel).

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
