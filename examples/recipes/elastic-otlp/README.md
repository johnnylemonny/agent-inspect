# Elastic OTLP recipe (indexed readback)

Export AgentInspect OTLP → (optional) Collector → Elastic APM/Elasticsearch, then **query indexed fixture trace IDs**. HTTP accept alone is not success.

## Deployment route (documented)

1. AgentInspect `export --format otlp-json --validate --json`
2. Optional local Collector (`collector.yaml`) forwarding OTLP/HTTP to Elastic
3. Query Elasticsearch / Kibana for the fixture `runId` / span names
4. Produce retained/lost field report

Credentials stay **external** (`ELASTIC_URL`, `ELASTIC_API_KEY`). Never commit secrets.

```bash
pnpm build
cd examples/recipes/elastic-otlp
pnpm install
pnpm verify          # offline field-map + simulated index query
pnpm verify:live     # live query when ELASTIC_URL is set; else labeled unverified
```
