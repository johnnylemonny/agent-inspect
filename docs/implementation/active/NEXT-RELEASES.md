# Active execution plan — after 6.31.9

**Authority:** [../ROADMAP.md](../ROADMAP.md)
**Baseline:** **published** `agent-inspect@6.31.9` · Version Packages `#465` · Publish `36286862048`
**Named train:** `suite-context-trust-after-6318`
**Program status:** 6.31.9 shipped (C01+C02); next C05; adoption freeze **excluded**; **EVIDENCE_GATE not approved**; **V7_DECISION: NO-GO**

## Sequence

1. **6.31.9** — suite assertion integrity + packed CJS context identity — **published**
2. **C05** — API misuse diagnostics — **implemented (pending publish)**
3. **C06–C07** — Explain logical counts; rule/outcome summaries — **next** after C05 publish
4. **C08–C12** — OpenAI recipe, expected-failure asserts, Nest Evidence, safety, provenance — queued
5. **C13** — Broader consumers — queued; split per adapter/app
6. **Demo C03–C04** — proactive-ai-demo; pin `agent-inspect@6.31.9`
7. **D01** — Docs/examples capture package — separate docs chunk
8. **External reproduction** — Promptfoo reviewer kit; **6.32.0** claims remain **BLOCKED_ON_EXTERNAL_EVIDENCE**
9. **Parallel** — P11 FreshCtx #450; P28 Dependabot
10. **v7** — NO-GO

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
LAST_PUBLISHED_RELEASE: 6.31.9
ACTIVE: suite-context-trust-after-6318
NEXT: C05 API misuse diagnostics
V7_DECISION: NO-GO
EVIDENCE_GATE: not approved
ADOPTION_FREEZE: excluded
```
