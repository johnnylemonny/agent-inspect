# Current task

```yaml
executionMode: maintainer-reviewed
namedTrain: correctness-after-6316
currentTrain: correctness-after-6316
trainStatus: active
currentChunk: "Maintainer review: Chunks 0–6 landed on chore/chunk0-roadmap-sync; P03 blocked; publish via Changesets"
nextAction: "Review branch; merge #454 remotely if not closed; run core gate; Version Packages when ready for 6.31.7/6.31.8"
canonicalRoadmap: docs/implementation/ROADMAP.md
activePlan: docs/implementation/active/NEXT-RELEASES.md
pendingManualGate: "EVIDENCE_GATE not approved; #450 FreshCtx partner Revera reruns parallel"
worktreeIgnoreOnly:
  - .redstamp/
  - redstamp-proposal-issue-body.md
```

## Published baseline

**6.31.6** on npm (Trusted Publish) — false-SAFE marker-slash + multihost MongoDB residuals closed (#455 → Version Packages #456). Packed `@agent-inspect/redact@6.31.6` canary retest PASS.

## Sequenced status

| Item | Status |
| --- | --- |
| 6.31.6 P02 false-SAFE residuals | **published** |
| P05 website headers/crawler (#458) | **done** |
| OTLP BigInt timestamps | **done** (keep tests; do not rebuild) |
| Chunk 0 public-truth / roadmap sync | **done** |
| P06 AI SDK docs (1A) + starters (1B) | **done** |
| P01 exact custom-rule matching | deferred → next patch if ready |
| #454 / #453 timeline (P27) | **landed locally** + Changeset |
| P03A/B/C false-pass checks | **blocked** — missing authoritative probe scripts |
| P07 export fidelity | **done** |
| P20 OTLP numeric enums + nested validation | **done** |
| Collector / Promptfoo / Elastic recipes | **done** (executable verify scripts) |
| #450 FreshCtx | parallel P11; permission granted; partner rerun pending |
| #444/#445/#446 Dependabot | do not merge until P28 |
| Adoption freeze | excluded |
| V7 | NO-GO |

## Stop marker

```text
LAST_PUBLISHED_RELEASE: 6.31.6
ACTIVE: maintainer review of export→Promptfoo→Elastic train work
NEXT: publish 6.31.7 (timeline) then 6.31.8 (export/OTLP) via Changesets
V7_DECISION: NO-GO
EVIDENCE_GATE: not approved
ADOPTION_FREEZE: excluded
```
