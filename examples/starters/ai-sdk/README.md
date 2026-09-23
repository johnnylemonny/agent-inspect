# ai-sdk starter

Keyless AI SDK telemetry demo: `MockLanguageModelV3` + `@agent-inspect/ai-sdk`.

Runs **correct** (`lookup_orders`) and **wrong** (`delete_orders`) tool paths that return the **same** final answer, then selects each run by exact `runName` (never newest).

Adoption guide: [docs/AI-SDK-ADOPTION.md](../../../docs/AI-SDK-ADOPTION.md)

```bash
pnpm install && pnpm start
npx agent-inspect view <correct-run-id> --dir .agent-inspect --summary
npx agent-inspect check <correct-run-id> --dir .agent-inspect --required-tool lookup_orders
```

Tested peer: `ai@6.0.210`. Wire telemetry with `experimental_telemetry.integrations: [integration]`.
