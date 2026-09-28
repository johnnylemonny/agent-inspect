# Active execution plan — after 6.31.11

**Authority:** [../ROADMAP.md](../ROADMAP.md)
**Baseline:** **published** `agent-inspect@6.31.11` · Version Packages `#471` · Publish `36334392282`
**Named train:** `stability-after-63111`
**Program status:** suite-trust closures shipped through 6.31.11; stability train active (C00→C01…); **EVIDENCE_GATE not approved**; **V7_DECISION: NO-GO**

## Sequence

1. **6.31.11** — suite/capture trust follow-through — **published**
2. **C00** — Reconcile current-state ROADMAP/state tables to 6.31.11 — **implemented**
3. **C01** — Promptfoo recipe + reviewer-kit verifier integrity — **implemented** (proposed **6.31.12**)
4. **C02–C03** — Strict nested suite config; OpenAI SDK boundary/IDs/retries — **implemented** (proposed **6.31.12**)
5. **C04–C06** — Run duration; logical execution-step counts; OTLP recursive validation — **next** (proposed **6.31.13**)
6. **C07–C09** — Structured Collector/Elastic verifiers — queued (proposed **6.31.14**); **C10** actual Elastic blocked on credentials
7. **Demo D03–D07** — journal, live profiles, failure retention, native evidence, ledger — separate repo
8. **C11–C12** — Executable/packed matrix; docs/case studies — queued (proposed **6.31.15**)
9. **6.32.0** — existing external-evidence gate — **BLOCKED_ON_EXTERNAL_EVIDENCE**
10. **6.33.0** — conditional additive usability — only if justified
11. **v7** — NO-GO

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
LAST_PUBLISHED_RELEASE: 6.31.11
ACTIVE: stability-after-63111
NEXT: maintainer review of C00–C03 → proposed 6.31.12 Changeset
V7_DECISION: NO-GO
EVIDENCE_GATE: not approved
ADOPTION_FREEZE: excluded
```
