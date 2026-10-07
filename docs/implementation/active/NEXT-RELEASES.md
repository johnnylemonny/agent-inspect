# Active execution plan — Oct 7 after 6.31.17

**Authority:** [../ROADMAP.md](../ROADMAP.md)
**Baseline:** **published** `agent-inspect@6.31.17` (all 18)
**Named train:** `stability-after-63111`
**Program status:** privacy + Windows patch **published**; residual W01+ repo work; **EVIDENCE_GATE not approved**; **V7_DECISION: NO-GO**

## Sequence

1. **6.31.12**–**6.31.17** — **published**
2. **W01** — residual Promptfoo exact identity (#481), OTLP typed AnyValues (#482), kit pin (#483) — **repo-only**
3. **W02** — demo #3–#5 (`proactive-ai-demo`)
4. Later conditional patches only if defects reproduce; omit empty slots
5. **W22** — C10 Elastic / Collector Docker — credential/environment gated
6. **6.32.0** — **BLOCKED_ON_EXTERNAL_EVIDENCE** ([EXTERNAL-ACCEPTANCE-GATE.md](./EXTERNAL-ACCEPTANCE-GATE.md))
7. **v7** — NO-GO

## Claim discipline

- Synthetic verifier / stub controls ≠ actual Docker Collector or credentialed Elastic execution
- Do not open a Changeset for **6.32.0** without an approved worksheet
- Re-query `npm view agent-inspect version` before each patch allocation

## Stop rules

- No schema 1.1; no root OTel; no default network; no empty releases
- Trusted Publish only via `publish.yml`

## External stop marker

```text
LAST_PUBLISHED_RELEASE: 6.31.17
ACTIVE: stability-after-63111 (Oct 7; post-6.31.17)
NEXT: W01 → W02; no 6.32 without EVIDENCE_GATE
V7_DECISION: NO-GO
EVIDENCE_GATE: not approved
ADOPTION_FREEZE: excluded
```
