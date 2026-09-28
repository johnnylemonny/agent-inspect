# Active execution plan — after 6.31.13

**Authority:** [../ROADMAP.md](../ROADMAP.md)
**Baseline:** **published** `agent-inspect@6.31.13`
**Named train:** `stability-after-63111`
**Program status:** stability train active; **EVIDENCE_GATE not approved**; **V7_DECISION: NO-GO**

## Sequence

1. **6.31.12** — C00–C03 verifiers + SDK — **published**
2. **6.31.13** — C04–C06 timing + OTLP bounds — **published**
3. **C07–C09** — Transport identity comparator; Collector/Elastic verifiers — **shipping** (proposed **6.31.14**); **C10** actual Elastic blocked
4. **Demo D03–D07** — journal, live profiles, failure retention, native evidence, ledger — separate repo
5. **C11–C12** — Executable/packed matrix; docs/case studies — queued (proposed **6.31.15**)
6. **6.32.0** — existing external-evidence gate — **BLOCKED_ON_EXTERNAL_EVIDENCE**
7. **6.33.0** — conditional additive usability — only if justified
8. **v7** — NO-GO

## Claim discipline

- Synthetic verifier controls ≠ actual Promptfoo/Collector/Elastic execution
- Attributed integration ZIP results remain attributed until artifacts are imported
- Suite-trust C01–C13 numbering is historical; stability package uses C00–C12 / D03–D07 / X01–X03

## Stop rules

- No schema 1.1; no root OTel; no default network; no empty releases
- Do not mark `EVIDENCE GATE APPROVED` from private FreshCtx or two Promptfoo replies alone
- Trusted Publish only via `publish.yml`
- One-chunk maintainer-reviewed commits unless explicitly authorized further

## External stop marker

```text
LAST_PUBLISHED_RELEASE: 6.31.13
ACTIVE: stability-after-63111
NEXT: publish 6.31.14 then C11–C12; halt at 6.32 without EVIDENCE_GATE
V7_DECISION: NO-GO
EVIDENCE_GATE: not approved
ADOPTION_FREEZE: excluded
```
