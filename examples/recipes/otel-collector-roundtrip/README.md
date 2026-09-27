# OTEL Collector round-trip recipe

Two **named** modes — do not collapse them:

| Mode | Command | Claim |
| --- | --- | --- |
| `fixture-self-test` | `pnpm verify` | Export shape + field compare using the export as a simulated batch. **Not** a live Collector claim. |
| `collector` | `pnpm verify:docker` | Real Collector ingestion; independent `/out/collected-traces.json` readback. Empty/rejected output **fails** (no export fallback). |

```bash
pnpm build   # from repo root
cd examples/recipes/otel-collector-roundtrip
pnpm install
pnpm verify
pnpm verify:docker   # requires Docker; pin digest via OTEL_COLLECTOR_IMAGE=...@sha256:...
```

See [docs/OTEL-COLLECTOR-ROUNDTRIP.md](../../../docs/OTEL-COLLECTOR-ROUNDTRIP.md).
