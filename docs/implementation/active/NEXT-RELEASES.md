# Active execution plan — after 6.31.14

**Authority:** [../ROADMAP.md](../ROADMAP.md)
**Baseline:** **published** `agent-inspect@6.31.14`
**Named train:** `stability-after-63111`
**Program status:** stability train finishing C11–C12; **EVIDENCE_GATE not approved**; **V7_DECISION: NO-GO**

## Sequence

1. **6.31.12** — C00–C03 verifiers + SDK — **published**
2. **6.31.13** — C04–C06 timing + OTLP bounds — **published**
3. **6.31.14** — C07–C09 transport identity — **published**; **C10** actual Elastic blocked
4. **C11–C12** — Executable/packed matrix; docs consolidation — **shipping** (proposed **6.31.15**)
5. **Demo D03–D07** — separate repo
6. **6.32.0** — existing external-evidence gate — **BLOCKED_ON_EXTERNAL_EVIDENCE**
7. **6.33.0** — conditional additive usability — only if justified
8. **v7** — NO-GO

## Claim discipline

- Synthetic verifier controls ≠ actual Promptfoo/Collector/Elastic execution
- Pending Docker/Elastic rows stay labeled pending
- Suite-trust C01–C13 numbering is historical; stability package uses C00–C12 / D03–D07 / X01–X03

## Stop rules

- No schema 1.1; no root OTel; no default network; no empty releases
- Do not mark `EVIDENCE GATE APPROVED` from private FreshCtx or two Promptfoo replies alone
- Trusted Publish only via `publish.yml`
- **Do not open a Changeset for 6.32.0** without an approved external acceptance worksheet

## External stop marker

```text
LAST_PUBLISHED_RELEASE: 6.31.14
ACTIVE: stability-after-63111
NEXT: publish 6.31.15 then halt — EVIDENCE_GATE required for 6.32
V7_DECISION: NO-GO
EVIDENCE_GATE: not approved
ADOPTION_FREEZE: excluded
```
