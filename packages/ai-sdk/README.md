# @agent-inspect/ai-sdk

Vercel AI SDK telemetry → local AgentInspect traces (metadata-only by default).


**Support level:** Supported — see [SUPPORT-LEVELS.md](https://github.com/rajudandigam/agent-inspect/blob/main/docs/SUPPORT-LEVELS.md). Network behavior: [NETWORK-BEHAVIOR.md](https://github.com/rajudandigam/agent-inspect/blob/main/docs/NETWORK-BEHAVIOR.md).

## When to use

- You use `generateText`, `streamText`, or tool calls via the [AI SDK](https://sdk.vercel.ai/)
- You want framework-native lifecycle mapping without manual `step()` calls

## When not to use

- Non–AI SDK agents (use `observe`, OpenAI Agents, or LangChain adapters)
- Hosted observability replacement

## Install

```bash
npm install agent-inspect @agent-inspect/ai-sdk ai
```

**Peer:** `ai@^6.0.0` — tested with **`ai@6.0.210`**. Do not assume AI SDK 7 compatibility.

## Example

```ts
import { generateText } from "ai";
import { agentInspect } from "@agent-inspect/ai-sdk";

const integration = agentInspect({
  traceDir: ".agent-inspect",
  runName: "my-agent",
});

try {
  const result = await generateText({
    model: yourModel,
    prompt: "Hello",
    experimental_telemetry: {
      isEnabled: true,
      recordInputs: false,
      recordOutputs: false,
      integrations: [integration],
    },
  });
  console.log(result.text);
} finally {
  await integration.flush();
  await integration.close();
}
```

**Required:** `recordInputs: false` and `recordOutputs: false` — AgentInspect does not upload to Vercel; traces stay local.

Pass the integration only through `experimental_telemetry.integrations`. There are no `getTelemetryMetadata()` / `getTelemetryHandlers()` helpers.

## Concurrent generations

Use a **separate** `agentInspect()` instance per concurrent `generateText` / `streamText` call. Sharing one integration across overlapping generations can mix lifecycle rows.

## Privacy

- Writes JSONL under `.agent-inspect/` only
- No network calls from AgentInspect
- Default capture: metadata-only
- `capture: "preview"` is opt-in and persists bounded `*Preview` attributes, redacted before they reach disk and truncated at `maxPreviewChars`; there is no full-content mode
- Redaction is key-based, so a preview can still contain sensitive free text — run `agent-inspect redact` before sharing

## API

| Export | Purpose |
| ------ | ------- |
| `agentInspect(options)` | Returns an AI SDK `TelemetryIntegration` plus local helpers |
| `integration.flush()` | Flush pending writes (safe to call more than once) |
| `integration.close()` | Terminalize open rows and close the writer |
| `integration.getDiagnostics()` | Local warnings plus resolved capture mode and preview counters |
| `integration.getWriterStats()` | Optional writer stats when a writer is active |

## CLI

`npx agent-inspect list` · `view` · `report` · `check`

## Docs

- [AI SDK adoption guide](https://github.com/rajudandigam/agent-inspect/blob/main/docs/AI-SDK-ADOPTION.md)
- [Starter](https://github.com/rajudandigam/agent-inspect/tree/main/examples/starters/ai-sdk)
- [Root README](https://github.com/rajudandigam/agent-inspect#readme)

## Troubleshooting

- **No trace events:** Ensure `experimental_telemetry.isEnabled: true` and `integrations: [integration]`
- **Empty previews in preview mode:** the AI SDK did not provide the field for that step. AgentInspect reports `AI_CAPTURE_FIELD_UNAVAILABLE` through `onDiagnostic` and `getDiagnostics().capture`
- **Previews look cut off:** they are bounded by `maxPreviewChars`, which the `share` and `strict` redaction profiles cap further


## Version

Part of the fixed AgentInspect release line. See the npm badge / package manifest for the current version.

## License

MIT
