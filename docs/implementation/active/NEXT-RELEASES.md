# Active execution plan — Oct 7 after 6.31.16

**Authority:** [../ROADMAP.md](../ROADMAP.md)
**Baseline:** **published** `agent-inspect@6.31.16`
**Git tip (reconcile):** `09da2a3d` — includes merged-unreleased [#473](https://github.com/rajudandigam/agent-inspect/pull/473) (Windows `--policy`) and [#480](https://github.com/rajudandigam/agent-inspect/pull/480) (COMPARE)
**Named train:** `stability-after-63111`
**Program status:** Oct 7 W-pack active; **next public = 6.31.17**; **EVIDENCE_GATE not approved**; **V7_DECISION: NO-GO**

## Sequence

1. **6.31.12**–**6.31.16** — **published**
2. **W00** — state reconcile — **this file / CURRENT-TASK / RELEASE-TRAIN-STATE / ROADMAP slot rewrite**
3. **W26** + merged Windows (#473) → **6.31.17** patch (Changeset → Version Packages → `publish.yml`; verify all 18)
4. **W01** — residual Promptfoo exact identity (#481), OTLP typed AnyValues (#482), kit pin (#483) — repo-only unless a public fix is required
5. **W03** — packed-matrix honesty (#490); keep [#209](https://github.com/rajudandigam/agent-inspect/issues/209) open
6. **W02** — demo #3–#5 (`proactive-ai-demo`)
7. Later conditional patches (**W11** / **W04**) only if defects reproduce; omit empty slots
8. **W22** — C10 Elastic / Collector Docker — credential/environment gated
9. **6.32.0** — **BLOCKED_ON_EXTERNAL_EVIDENCE** ([EXTERNAL-ACCEPTANCE-GATE.md](./EXTERNAL-ACCEPTANCE-GATE.md))
10. **v7** — NO-GO

## Claim discipline

- Synthetic verifier / stub controls ≠ actual Docker Collector or credentialed Elastic execution
- Pending Docker/Elastic live rows stay labeled pending in [TESTED-SUPPORT-MATRIX.md](../TESTED-SUPPORT-MATRIX.md)
- Do not open a Changeset for **6.32.0** without an approved worksheet
- Re-query `npm view agent-inspect version` before each patch allocation

## Stop rules

- No schema 1.1; no root OTel; no default network; no empty releases
- Do not mark `EVIDENCE GATE APPROVED` from private FreshCtx or two Promptfoo replies alone
- Trusted Publish only via `publish.yml`
- No Dependabot force-merge inside the privacy release

## External stop marker

```text
LAST_PUBLISHED_RELEASE: 6.31.16
ACTIVE: stability-after-63111 (Oct 7; next public = 6.31.17)
NEXT: W26 → 6.31.17; W01+; no 6.32 without EVIDENCE_GATE
V7_DECISION: NO-GO
EVIDENCE_GATE: not approved
ADOPTION_FREEZE: excluded
```
