# Active execution plan — after 6.31.15

**Authority:** [../ROADMAP.md](../ROADMAP.md)
**Baseline:** **published** `agent-inspect@6.31.15`
**Named train:** `stability-after-63111`
**Program status:** stability patch slots **complete**; **EVIDENCE_GATE not approved**; **V7_DECISION: NO-GO**

## Sequence

1. **6.31.12** — C00–C03 verifiers + SDK — **published**
2. **6.31.13** — C04–C06 timing + OTLP bounds — **published**
3. **6.31.14** — C07–C09 transport identity — **published**; **C10** actual Elastic blocked
4. **6.31.15** — C11–C12 matrix + docs — **published**
5. **Demo D03–D07** — separate repo
6. **6.32.0** — existing external-evidence gate — **BLOCKED_ON_EXTERNAL_EVIDENCE**
7. **6.33.0** — conditional additive usability — only if justified
8. **v7** — NO-GO

## Claim discipline

- Synthetic verifier controls ≠ actual Promptfoo/Collector/Elastic execution
- Pending Docker/Elastic rows stay labeled pending in [TESTED-SUPPORT-MATRIX.md](../TESTED-SUPPORT-MATRIX.md)
- Do not open a Changeset for **6.32.0** without an approved external acceptance worksheet ([EXTERNAL-ACCEPTANCE-GATE.md](./EXTERNAL-ACCEPTANCE-GATE.md))

## Stop rules

- No schema 1.1; no root OTel; no default network; no empty releases
- Do not mark `EVIDENCE GATE APPROVED` from private FreshCtx or two Promptfoo replies alone
- Trusted Publish only via `publish.yml`

## External stop marker

```text
LAST_PUBLISHED_RELEASE: 6.31.15
ACTIVE: stability-after-63111 (halted at external gate)
NEXT: EVIDENCE_GATE worksheet required before any 6.32 Changeset
V7_DECISION: NO-GO
EVIDENCE_GATE: not approved
ADOPTION_FREEZE: excluded
```
