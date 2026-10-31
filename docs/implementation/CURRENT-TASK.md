# Current task

```yaml
executionMode: maintainer-reviewed
namedTrain: stability-after-63111
currentTrain: stability-after-63111
trainStatus: "#521/#522 fixed + changeset; pending Version Packages → 6.31.33"
currentChunk: "unfinished-order + lookalike tool findings"
nextAction: "Push; Version Packages; Trusted Publish 6.31.33; close #521/#522"
canonicalRoadmap: docs/implementation/ROADMAP.md
activePlan: docs/implementation/active/NEXT-RELEASES.md
pendingManualGate: "EVIDENCE_GATE not approved — blocks 6.32.0; Indu v3 artifact missing; C10 Elastic --live; Collector Docker; Jan Windows PENDING"
worktreeIgnoreOnly:
  - .redstamp/
  - redstamp-proposal-issue-body.md
  - .tmp-plumbline/
  - tmp/
```

## Published baseline

**6.31.32** — Trusted Publish [41220820360](https://github.com/rajudandigam/agent-inspect/actions/runs/41220820360); Version Packages [#524](https://github.com/rajudandigam/agent-inspect/pull/524). npm `agent-inspect@6.31.32` (registry confirmed).

## Overnight / follow-up queue

| Item | Status | Notes |
| --- | --- | --- |
| #517–#520, #523 | **closed in 6.31.32** | causal ties, Stripe, evidence assessment, starter |
| #521 unfinished order | **fixed (pending publish)** | unfinished before → interval-unresolved; run.status names tool |
| #522 lookalike tools | **fixed (pending publish)** | U+XXXX in messages; allowlist cause sorts first |

## Honesty

- Partner issues stay open for acceptance.
- Windows matrix for packed MCP SDK remains **NOT RUN / PENDING**.
- #496 / #506 stay red; do not merge.
- Indu v3 / Swapnil fields / EVIDENCE_GATE / v7 unchanged.
- Emails remain user-owned.
