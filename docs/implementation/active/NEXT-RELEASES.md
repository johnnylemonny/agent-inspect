# Active execution plan — after 6.31.8

**Authority:** [../ROADMAP.md](../ROADMAP.md)
**Baseline:** **published** `agent-inspect@6.31.8` · Version Packages `#463` · Publish `36282665276` (+ tui republish `36284404129`)
**Named train:** `suite-context-trust-after-6318`
**Program status:** 6.31.8 shipped; C01+C02 implemented locally; adoption freeze **excluded**; **EVIDENCE_GATE not approved**; **V7_DECISION: NO-GO**

## Sequence

1. **6.31.8** — integration honesty — **published**
2. **C01** — Suite assertion integrity (fail-closed empty/unknown/`requireSuccess`) — **implemented (review)**
3. **C02** — Packed CJS root/`/advanced` context identity — **implemented (review)**
4. **C05** — API misuse diagnostics — **next**
5. **C06–C07** — Explain logical counts; rule/outcome summaries — queued
6. **C08–C12** — OpenAI recipe, expected-failure asserts, Nest Evidence, safety, provenance — queued
7. **C13** — Broader consumers — queued; split per adapter/app
8. **Demo C03–C04** — proactive-ai-demo journal + live-profile — separate repo after C02 candidate
9. **D01** — Docs/examples capture package — separate docs chunk
10. **External reproduction** — Promptfoo reviewer kit; **6.32.0** claims remain **BLOCKED_ON_EXTERNAL_EVIDENCE**
11. **Parallel** — P11 FreshCtx #450; P28 Dependabot
12. **v7** — NO-GO

## Claim discipline

- `recipes:check` layout ≠ Promptfoo/Collector/Elastic execution
- Offline Elastic/Collector modes are **not** destination-observed
- P03 remains **blocked** (no audit probes)
- Suite zero-assertion / unknown-selector / ignored `eval.requireSuccess` are product defects (not demo harness)

## Stop rules

- No schema 1.1; no root OTel; no default network; no empty releases
- Do not mark `EVIDENCE GATE APPROVED` from private FreshCtx alone
- Trusted Publish only via `publish.yml`
- One-chunk maintainer-reviewed commits; no undocumented suite `captureOnly` bypass

## External stop marker

```text
LAST_PUBLISHED_RELEASE: 6.31.8
ACTIVE: suite-context-trust-after-6318
NEXT: review C01+C02 → patch publish → C05
V7_DECISION: NO-GO
EVIDENCE_GATE: not approved
ADOPTION_FREEZE: excluded
```
