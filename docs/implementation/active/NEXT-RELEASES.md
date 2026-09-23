# Active execution plan — after 6.31.6 security patch

**Authority:** [../ROADMAP.md](../ROADMAP.md) · Sep 22 maintainer audit
**Baseline:** **published** `agent-inspect@6.31.6` · Version Packages `#456` · schema `1.0`
**Named train:** `correctness-after-6316`
**Program status:** Security residuals shipped; website headers (#458) done; BigInt OTLP timestamps done; adoption freeze **excluded**; **EVIDENCE_GATE not approved**; **V7_DECISION: NO-GO**

## Sequence

1. **6.31.6** — P02A/B false-SAFE residuals — **published**
2. **Docs (P06)** — AI SDK README/adoption (Chunk 1A) then real starters (Chunk 1B) — **next**
3. **6.31.7** — P27 timeline (#454); P03A/B/C false-pass checks; optional P01 — **active**
4. **6.31.8** — P07 export fidelity; P20 OTLP numeric enums + nested validation
5. **Recipes** — Collector roundtrip; executable Promptfoo; Elastic indexed readback (may ship without a minor)
6. **6.32.0** — Additive evidence/identity (P08+); not empty minor; **BLOCKED_ON_EXTERNAL_EVIDENCE** for conformance claims
7. **6.33.0** — Runnable integrations when additive
8. **Parallel** — P11 FreshCtx #450; P28 Dependabot splits (P05 website headers #458 **done**)
9. **v7** — NO-GO

## Stop rules

- No schema 1.1; no root OTel; no default network; no empty releases
- Do not mark `EVIDENCE GATE APPROVED` from private FreshCtx alone
- Trusted Publish only via `publish.yml`

## External stop marker

```text
LAST_PUBLISHED_RELEASE: 6.31.6
ACTIVE: 6.31.7 correctness + P06 AI SDK docs
NEXT: 6.31.8 export/OTLP
V7_DECISION: NO-GO
EVIDENCE_GATE: not approved
ADOPTION_FREEZE: excluded
```
