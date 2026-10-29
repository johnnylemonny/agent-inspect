# Limits — what this packet is not

## Scope (in scope)

- Local synthetic and `inspectRun`-captured traces converted with **default OTLP JSON** export and read back through the OTLP reader.
- **TraceContract** evaluation on native JSONL vs OTLP round-trip for the cases defined in `scripts/f04-otlp-identity-evidence.mjs`.
- Identity attributes: `agent_inspect.operation_id`, `agent_inspect.attempt_id`, `agent_inspect.retry_of`, `agent_inspect.attempt_number`, and reader promotion to camelCase fields documented in `mapping-and-loss-table.json`.

## Out of scope (explicit non-claims)

- **No Honeycomb, Refinery, or production backend validation.** OTLP JSON is not posted to a vendor endpoint in this harness.
- **No live OpenTelemetry Collector round-trip** (see repo doc `docs/OTEL-COLLECTOR-ROUNDTRIP.md` for a separate manual path).
- **No billing, invoice, or cost-impact claims.**
- **No partner acceptance** (Roy/Robb sign-off) and **no EVIDENCE_GATE** approval — repository artifact only.
- **No customer data** — all inputs are maintainer-controlled synthetic or locally generated traces.
- **O06** partial identity is classified **`unknown_unverifiable`** at packet level when `operationId` is missing; the harness does not invent retry grouping from tool name alone.

## Mapping / loss (summary)

Full detail: [mapping-and-loss-table.json](mapping-and-loss-table.json).

- Dotted `agent_inspect.*` OTLP attributes are retained; reader promotes to camelCase where documented.
- Conflicting direct vs nested identity surfaces **`contract.retry.ambiguous-identity`** (A14, AR01).
- OTLP export bounds long string values; AR01 asserts ambiguous identity survives bounding without leaking unbounded IDs in export bytes.
- Identities are **not** inferred from tool name or arguments (O07 retains distinct `operationId`s despite equal args).

## Environment for this capture

- **Package:** agent-inspect@6.31.29 (workspace `package.json` string)
- **Git SHA:** `cb74e6b1d6d749fc6fcc01d00e4a18bca7d494e5`
- **Date:** 2026-10-29
- Re-running on another Node/OS may change nanoid `runId` values and trace timestamps; contract statuses and rule IDs should remain stable if core behavior is unchanged.
