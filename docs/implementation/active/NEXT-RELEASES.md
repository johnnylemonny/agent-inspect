# Active execution plan — after 6.31.16

**Authority:** [../ROADMAP.md](../ROADMAP.md)
**Baseline:** **published** `agent-inspect@6.31.16`
**Named train:** `stability-after-63111`
**Program status:** reopen patches **published**; **EVIDENCE_GATE not approved**; **V7_DECISION: NO-GO**

## Sequence

1. **6.31.12**–**6.31.15** — stability train — **published**
2. **6.31.16** — C01 + C07–C09 + C11 reopen — **published** (all 18 packages)
3. **C10** actual Elastic — credential-gated
4. **Demo D03–D07** — `proactive-ai-demo` #1 **merged**; pin **6.31.16** via #2 **merged**
5. **6.32.0** — external-evidence gate — **BLOCKED_ON_EXTERNAL_EVIDENCE** ([EXTERNAL-ACCEPTANCE-GATE.md](./EXTERNAL-ACCEPTANCE-GATE.md))
6. **6.33.0** — conditional additive usability — only if justified
7. **v7** — NO-GO

## Claim discipline

- Synthetic verifier / stub controls ≠ actual Docker Collector or credentialed Elastic execution
- Pending Docker/Elastic live rows stay labeled pending in [TESTED-SUPPORT-MATRIX.md](../TESTED-SUPPORT-MATRIX.md)
- Do not open a Changeset for **6.32.0** without an approved worksheet

## Stop rules

- No schema 1.1; no root OTel; no default network; no empty releases
- Do not mark `EVIDENCE GATE APPROVED` from private FreshCtx or two Promptfoo replies alone
- Trusted Publish only via `publish.yml`

## External stop marker

```text
LAST_PUBLISHED_RELEASE: 6.31.16
ACTIVE: stability-after-63111 (halted at external gate)
NEXT: EVIDENCE_GATE worksheet required before any 6.32 Changeset
V7_DECISION: NO-GO
EVIDENCE_GATE: not approved
ADOPTION_FREEZE: excluded
```
