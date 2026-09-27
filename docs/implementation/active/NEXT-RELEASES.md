# Active execution plan — after 6.31.7

**Authority:** [../ROADMAP.md](../ROADMAP.md)
**Baseline:** **published** `agent-inspect@6.31.7` · Version Packages `#460`
**Named train:** `integration-honesty-after-6317`
**Program status:** 6.31.7 shipped; integration honesty P1 patches in flight; adoption freeze **excluded**; **EVIDENCE_GATE not approved**; **V7_DECISION: NO-GO**

## Sequence

1. **6.31.7** — timeline + export/OTLP train — **published**
2. **Patch (honesty)** — export lifecycle coalesce; AI SDK starter fidelity; modelId/source/duration; producer validation; honest Promptfoo/Collector/Elastic verifiers — **active**
3. **External reproduction** — standalone Promptfoo reviewer kit after honesty patch publishes
4. **6.32.0** — Additive evidence/identity; **BLOCKED_ON_EXTERNAL_EVIDENCE** for conformance claims
5. **Parallel** — P11 FreshCtx #450; P28 Dependabot (do not merge until ready)
6. **v7** — NO-GO

## Claim discipline

- `recipes:check` layout ≠ Promptfoo/Collector/Elastic execution
- Offline Elastic/Collector modes are **not** destination-observed
- P03 remains **blocked** (no audit probes)

## Stop rules

- No schema 1.1; no root OTel; no default network; no empty releases
- Do not mark `EVIDENCE GATE APPROVED` from private FreshCtx alone
- Trusted Publish only via `publish.yml`

## External stop marker

```text
LAST_PUBLISHED_RELEASE: 6.31.7
ACTIVE: integration honesty after 6.31.7
NEXT: patch publish + external Promptfoo kit
V7_DECISION: NO-GO
EVIDENCE_GATE: not approved
ADOPTION_FREEZE: excluded
```
