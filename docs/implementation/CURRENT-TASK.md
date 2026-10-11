# Current task

```yaml
executionMode: maintainer-reviewed
namedTrain: stability-after-63111
currentTrain: stability-after-63111
trainStatus: "6.31.20 published; W23A #490 closed; 6.32 blocked"
currentChunk: "post-W23A partner/gated holds"
nextAction: "Artifact-first partner drafts; plumbline #98 re-review on authorize; no 6.32 without EVIDENCE_GATE"
canonicalRoadmap: docs/implementation/ROADMAP.md
activePlan: docs/implementation/active/NEXT-RELEASES.md
pendingManualGate: "EVIDENCE_GATE not approved — blocks 6.32.0; C10 Elastic --live; Collector Docker"
worktreeIgnoreOnly:
  - .redstamp/
  - redstamp-proposal-issue-body.md
  - .tmp-plumbline/
  - tmp/
```

## Published baseline

**6.31.20** — all 18 packages on npm (Trusted Publish [38163150789](https://github.com/rajudandigam/agent-inspect/actions/runs/38163150789)).

## W23A / #490

Canonical ROADMAP, active plans, packed-matrix CI primary, and train pointers aligned to **published 6.31.20**. COMPARE OrcaReplay wording already correct (log/trace readers; simultaneous capture untested). #209 stays open.

## Manual holds

Indu v3 archive; Swapnil #437 fields; João binaries; plumbline #98 re-request; email.

## Stop marker

```text
LAST_PUBLISHED_RELEASE: 6.31.20
ACTIVE: stability-after-63111 (W23A closed)
NEXT: partner packets / plumbline re-review authorize; no 6.32 without EVIDENCE_GATE
V7_DECISION: NO-GO
EVIDENCE_GATE: not approved
ADOPTION_FREEZE: excluded
```
