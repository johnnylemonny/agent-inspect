# Active execution plan — post-6.31.30

**Train:** `stability-after-63111`
**Authority:** [../ROADMAP.md](../ROADMAP.md) · [NEXT-RELEASES.md](./NEXT-RELEASES.md)
**Baseline:** published `agent-inspect@6.31.30` (all 18) · **6.32.0 BLOCKED_ON_EXTERNAL_EVIDENCE** · **V7_DECISION: NO-GO**

## Scope

1. Land Oct 30 residual queue (R1–R6, N1 Jan packed-SDK assertions, N2 Roy UNPROVABLE fixtures) as independently reviewed chunks
2. Partner acceptance follow-through (#484 `-003`, #494 Windows rerun, #491 closure, #437 fields) without fabricating results
3. Skip empty **6.31.31+** unless a public defect reproduces or residuals ship as a patch
4. Conditional **6.32.0** only with approved [EXTERNAL-ACCEPTANCE-GATE.md](./EXTERNAL-ACCEPTANCE-GATE.md)
5. v7 assessment only — no implementation

## Explicit non-goals

- Local `npm publish`
- Schema 1.1 / hosted SaaS / default network / CoT capture / pricing engine / replay / retry execution
- Merging grouped Dependabot majors without dedicated migrations (#496 / #506 remain red — do not merge)
- Fabricating retained-use or external conformance evidence
- Implementing v7
- Blast email sends (artifact-first drafts only when authorized)
- Blindly merging docs PRs that stop at an older baseline (e.g. #505 → 6.31.23)

## Chunks

See [NEXT-RELEASES.md](./NEXT-RELEASES.md) and [../CURRENT-TASK.md](../CURRENT-TASK.md).

## Stop rule

Trusted Publish each release when Changesets/npm/tags agree. Do not mark `EVIDENCE GATE APPROVED` from private case studies alone. **V7_DECISION: NO-GO**.
