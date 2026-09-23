# Recipe: local OpenTelemetry Collector round-trip

Send an AgentInspect trace through a **local** OpenTelemetry Collector and read it back, entirely offline. This shows that AgentInspect emits standards-shaped OTLP (numeric StatusCode/SpanKind) and can re-read what a collector forwards.

**Executable recipe:** [`examples/recipes/otel-collector-roundtrip/`](../examples/recipes/otel-collector-roundtrip/)

**See also:** [STANDARDS.md](./STANDARDS.md) · [INTEROP.md](./INTEROP.md)

## What this is (and isn't)

- **Local only.** Nothing leaves your machine. AgentInspect makes no network calls; you run the Collector yourself.
- Default `pnpm verify` is offline (export → simulated file-exporter batch → field compare → re-import). Use `pnpm verify:docker` for a live Collector.

## Versions

- `agent-inspect` **6.31.x**
- OpenTelemetry Collector Contrib — pin explicitly, e.g. `otel/opentelemetry-collector-contrib:0.109.0`. Prefer an image **digest** once you have verified it on your host (`docker pull` then record `@sha256:…`).

## Offline verify (no Docker)

```bash
pnpm build
cd examples/recipes/otel-collector-roundtrip
pnpm install
pnpm verify
```

## Live Collector (optional)

```bash
pnpm verify:docker
# or:
# OTEL_COLLECTOR_IMAGE=otel/opentelemetry-collector-contrib@sha256:<digest> pnpm verify:docker
```

## Manual steps

1. Export: `agent-inspect export <run-id> --dir ./.agent-inspect --format otlp-json --out ./otlp.json --validate --json`
2. Run Collector with [`collector.yaml`](../examples/recipes/otel-collector-roundtrip/collector.yaml)
3. `curl -X POST http://127.0.0.1:4318/v1/traces -H "Content-Type: application/json" --data-binary @otlp.json`
4. Parse **all** file-exporter batches; partial rejection fails the recipe verifier
5. `agent-inspect open ./collected-traces.json --format otlp-json` — re-import includes numeric status `0/1/2`

## Known loss

AgentInspect preserves instrumentation **scope** and span attributes, and reports unmapped OTLP shapes (events, links, vendor extensions) in `read.warnings` / `unsupportedFields`. Do not treat the round-trip as lossless for those fields.

## Failure modes

- **Validation off by default on export.** Pass `--validate` (and `--json` so harnesses parse stdout without scraping human logs).
- **Batched multi-line output.** Import/compare every batch; do not accept HTTP 200 alone.
- **Version drift.** Pin Collector image/digest.
- **Wrong endpoint or content type.** OTLP JSON → `:4318/v1/traces` with `Content-Type: application/json`.
