# Active execution plan — after 6.31.15 closure audit

**Authority:** [../ROADMAP.md](../ROADMAP.md)
**Baseline:** **published** `agent-inspect@6.31.15`
**Named train:** `stability-after-63111`
**Program status:** patch slots **published but incomplete** per 2026-09-28 closure audit; **reopen C01, C07–C09, C11**; **EVIDENCE_GATE not approved**; **V7_DECISION: NO-GO**

## Sequence

1. **6.31.12** — C00–C03 suite + OpenAI boundary — **published** (Promptfoo assertion identity **reopened**)
2. **6.31.13** — C04–C06 timing + OTLP bounds — **published** (verified)
3. **6.31.14** — C07–C09 transport identity — **published** (selected fields / NDJSON re-import / Elastic live path **reopened**)
4. **6.31.15** — C11–C12 matrix + docs — **published** (CI wiring + kit provenance **reopened**)
5. **C00** — Correct completion ledger + retarget EXTERNAL-ACCEPTANCE-GATE — **done**
6. **6.31.16** — C01 + C07–C09 + C11 reopen (exact Promptfoo, selected fields, NDJSON merge, Elastic stubs, CI) — **changeset ready**
7. **C10** actual Elastic — credential-gated
8. **Demo D03–D07** — separate repo (`proactive-ai-demo`)
9. **6.32.0** — external-evidence gate — **BLOCKED_ON_EXTERNAL_EVIDENCE**
10. **6.33.0** — conditional additive usability — only if justified
11. **v7** — NO-GO

## Claim discipline

- Synthetic verifier controls ≠ actual Promptfoo/Collector/Elastic execution
- Offline Pass rows that the audit reproduced as false-green are labeled **Partial** in [TESTED-SUPPORT-MATRIX.md](../TESTED-SUPPORT-MATRIX.md)
- Do not open a Changeset for **6.32.0** without an approved worksheet ([EXTERNAL-ACCEPTANCE-GATE.md](./EXTERNAL-ACCEPTANCE-GATE.md))

## Stop rules

- No schema 1.1; no root OTel; no default network; no empty releases
- Do not mark `EVIDENCE GATE APPROVED` from private FreshCtx or two Promptfoo replies alone
- Trusted Publish only via `publish.yml`

## External stop marker

```text
LAST_PUBLISHED_RELEASE: 6.31.15
ACTIVE: stability-after-63111 (reopened incomplete acceptance)
NEXT: C01 Promptfoo exact assertions (6.31.16)
V7_DECISION: NO-GO
EVIDENCE_GATE: not approved
ADOPTION_FREEZE: excluded
```
