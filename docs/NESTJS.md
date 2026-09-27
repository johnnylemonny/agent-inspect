# NestJS + AgentInspect

AgentInspect does **not** ship a production NestJS interceptor package. Use one of
the maintained paths below depending on whether you need harness fixture runs,
LangGraph callbacks, structured log ingestion, or Evidence v2 packaging.

## Paths (keep them distinct)

| Path | When to use | Starter / recipe |
| --- | --- | --- |
| Harness fixture runner | Bootstrap a real Nest `TestingModule` for local fixture runs | [examples/starters/harness-nestjs](../examples/starters/harness-nestjs/) |
| LangGraph callbacks | Nest services that already pass a `callbacks` array | [examples/recipes/nestjs-langgraph-local](../examples/recipes/nestjs-langgraph-local/) |
| Structured logs | Log ingestion without an agent adapter | [examples/recipes/nestjs-json-logging](../examples/recipes/nestjs-json-logging/) |
| Direct SDK / Evidence v2 | Explicit `createInspector` / writer + share-checked bundle | this guide + [shareable-bundle-basic](../examples/recipes/shareable-bundle-basic/) |

Manual tracing (`createInspector` / `inspectRun`) and framework adapters
(`@agent-inspect/langchain`) remain separate: do not mix duplicate manual +
adapter spans for the same invoke.

## Harness path

```ts
import { createFixtureRunner, defineTarget } from "@agent-inspect/harness";

await createFixtureRunner({
  name: "nestjs-support",
  trace: { mode: "run-if-enabled", traceDir: ".agent-inspect" },
  bootstrap: async () => {
    const moduleRef = await Test.createTestingModule({ /* ... */ }).compile();
    return moduleRef.createNestApplication();
  },
  shutdown: async (app) => {
    await app?.close?.();
  },
  targets: {
    ask: defineTarget({
      resolve: (app) => app.get(SupportAgent),
      invoke: (agent, input) => agent.run(input),
    }),
  },
}).runFromArgv();
```

## LangGraph callbacks (env-gated)

Prefer [nestjs-langgraph-local](../examples/recipes/nestjs-langgraph-local/):

- `AGENT_INSPECT` gate + lazy dynamic import (no adapter load when disabled)
- metadata-only capture and workspace-relative `traceDir`
- no production-path change when the helper returns `[]`

## Native Evidence v2 path

Use the same CLI builders Nest consumers already get from AgentInspect — do not
append unregistered files to a verified directory or use `--unexpected ignore`
to paper over a broken bundle.

```bash
# After a local Nest/harness run wrote JSONL under .agent-inspect
npx agent-inspect check <run-id> --dir .agent-inspect --json
npx agent-inspect bundle <run-id> --dir .agent-inspect --out ./evidence-out --json
npx agent-inspect bundle verify ./evidence-out --json
```

Programmatic packaging uses `buildEvidenceManifest` / `verifyEvidenceDirectory`
from `agent-inspect/advanced` (see [reproducible-repair-evidence](../examples/recipes/reproducible-repair-evidence/)
and [shareable-bundle-basic](../examples/recipes/shareable-bundle-basic/)).

Acceptance for a fresh consumer:

1. Documented commands produce a share-checked Evidence v2 directory
2. `bundle verify` reports checked files with zero issues on an intact package
3. Tampered or missing file bytes fail verification
4. Contract binding / custom-rule partiality remain visible when present
5. Verified hashes do **not** prove the Nest app was correctly instrumented —
   capture assertions and human review stay separate verdicts

For direct OpenAI Node capture without Nest, see
[openai-node-chat-completions](../examples/recipes/openai-node-chat-completions/).

## Out of scope

- `@agent-inspect/nestjs` production package (demand-gated)
- Redis/SQS mocking in harness
- Global monkey-patching of Nest providers
- Treating verified Evidence hashes as instrumentation proof

## Related

- [`@agent-inspect/harness`](../packages/harness/README.md)
- [examples/starters/harness-nestjs](../examples/starters/harness-nestjs/)
- [examples/recipes/nestjs-langgraph-local](../examples/recipes/nestjs-langgraph-local/)
- [docs/case-studies/nestjs-langgraph-local-evidence.md](./case-studies/nestjs-langgraph-local-evidence.md)
- [docs/SUPPORT-REPRODUCTION.md](./SUPPORT-REPRODUCTION.md)
