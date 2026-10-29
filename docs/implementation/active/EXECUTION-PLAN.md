# Active execution plan — post-6.31.28

**Train:** `stability-after-63111`
**Authority:** [../ROADMAP.md](../ROADMAP.md) · [NEXT-RELEASES.md](./NEXT-RELEASES.md)
**Baseline:** published `agent-inspect@6.31.28` (all 18) · **6.31.29** recipe evidence integrity pending Version Packages · **6.32.0 BLOCKED_ON_EXTERNAL_EVIDENCE** · **V7_DECISION: NO-GO**

## Scope

1. Finish **6.31.29** publication (timeout-ledger probes, comparable-cohort one-pass, Nest opaque refs)
2. Repository-only residual packages (Nest consumption; browser/timeout follow-through; #494 harness reconcile; partner packets) as independently reviewed chunks
3. Skip empty **6.31.30+** unless a public defect reproduces
4. Conditional next patch only for a verified public defect or authorized partner-acceptance follow-through
5. Conditional **6.32.0** only with approved [EXTERNAL-ACCEPTANCE-GATE.md](./EXTERNAL-ACCEPTANCE-GATE.md)
6. v7 assessment only — no implementation

## Explicit non-goals

- Local `npm publish`
- Schema 1.1 / hosted SaaS / default network / CoT capture / pricing engine / replay / retry execution
- Merging grouped Dependabot majors without dedicated migrations
- Fabricating retained-use or external conformance evidence
- Implementing v7
- Blast email sends (artifact-first drafts only when authorized)
- Blindly merging docs PRs that stop at an older baseline (e.g. #505 → 6.31.23)

## Chunks

See [NEXT-RELEASES.md](./NEXT-RELEASES.md). Historical 6.17–6.31.27 trains are complete for their published scopes. Pointer sync (2026-10-29) aligns this plan with [../RELEASE-TRAIN-STATE.md](../RELEASE-TRAIN-STATE.md).

## Stop rule

Trusted Publish each release when Changesets/npm/tags agree. Do not mark `EVIDENCE GATE APPROVED` from private case studies alone. **V7_DECISION: NO-GO**.
