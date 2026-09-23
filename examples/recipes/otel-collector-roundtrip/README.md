# OTEL Collector round-trip recipe

Executable offline (default) or Docker Collector verification for AgentInspect OTLP export.

```bash
pnpm build   # from repo root
cd examples/recipes/otel-collector-roundtrip
pnpm install
pnpm verify
# optional live Collector:
pnpm verify:docker
```

See [docs/OTEL-COLLECTOR-ROUNDTRIP.md](../../../docs/OTEL-COLLECTOR-ROUNDTRIP.md).
