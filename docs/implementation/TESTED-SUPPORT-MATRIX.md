# Tested support matrix (stability C11)

Executable claims for AgentInspect patches through **6.31.14**. Rows are **tested** support, not universal guarantees.

| Surface | Environment | How verified | Status |
| --- | --- | --- | --- |
| Core suite strict nested config | Node 22.x / CI | `packages/core/test/suite/suite.test.ts` | Pass |
| Tree duration from RUN end facts | Node 22.x / CI | `packages/core/test/logs/tree-builder.test.ts` | Pass |
| Explain execution-step counts | Node 22.x / CI | `packages/core/test/explain-slowest-node.test.ts` | Pass |
| OTLP producer recursive validation | Node 22.x / CI | `packages/core/test/exporters/validation.test.ts` | Pass |
| Promptfoo matrix verifier (offline + pinned eval) | Node 22.x local | `examples/recipes/promptfoo-use-together` | Pass (live CLI may be network-gated) |
| OpenAI Node chat.completions mock recipe | Node 22.x | `examples/recipes/openai-node-chat-completions` | Pass |
| Transport identity comparator | Node 22.x | `examples/recipes/integration-fixtures/helpers.test.mjs` | Pass |
| Collector fixture-self-test | Node 22.x local | `examples/recipes/otel-collector-roundtrip` (no `--docker`) | Pass |
| Collector Docker live | Docker + contrib image | `--docker` mode | **Pending** environment |
| Elastic offline export-document-sim | Node 22.x local | `examples/recipes/elastic-otlp` (no `--live`) | Pass |
| Elastic live indexed readback | Credentials + managed OTLP | `--live` | **Pending** credentials (C10) |
| Packed tarball smoke (18 packages) | CI `pack:smoke` | `pnpm pack:smoke` | Pass |
| Fixed-group linked versions | CI | `pnpm linked-versions:check` | Pass |

## How to re-run locally

```bash
pnpm typecheck && pnpm test
pnpm recipes:check
node --test examples/recipes/integration-fixtures/helpers.test.mjs
node examples/recipes/otel-collector-roundtrip/verify.mjs
node examples/recipes/elastic-otlp/verify.mjs
pnpm --filter agent-inspect-recipe-openai-node-chat-completions start
```

Do not treat pending Docker/Elastic rows as green. Do not merge pending rows into a single “all integrations pass” claim.
