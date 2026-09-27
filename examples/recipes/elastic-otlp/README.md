# Elastic OTLP recipe (indexed readback)

Export AgentInspect OTLP → Elastic managed OTLP (ApiKey) → **exact exported hex `trace.id` query**. HTTP accept alone is not success. Unrelated hits are not success.

## Modes

| Mode | Command | Claim |
| --- | --- | --- |
| Offline | `pnpm verify` | Export field compare + **export-document-sim** (explicitly not indexed). |
| Live | `pnpm verify:live` | Requires `ELASTIC_URL` + `ELASTIC_API_KEY`. Optional `ELASTIC_OTLP_URL` to send the export first. Fails if config missing or exact-trace hits absent. |

Credentials stay **external**. Never commit secrets.

```bash
pnpm build
cd examples/recipes/elastic-otlp
pnpm install
pnpm verify
ELASTIC_URL=... ELASTIC_API_KEY=... ELASTIC_OTLP_URL=... pnpm verify:live
```
