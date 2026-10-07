# Current task

```yaml
executionMode: maintainer-reviewed
namedTrain: stability-after-63111
currentTrain: stability-after-63111
trainStatus: "6.31.17 published; W01 in flight; 6.32 blocked"
currentChunk: "W01 Promptfoo/OTLP/kit residual verifiers (#481–#483)"
nextAction: "Land W01 repo-only; then W02 demo #3–#5; skip empty patches; no 6.32 without EVIDENCE_GATE"
canonicalRoadmap: docs/implementation/ROADMAP.md
activePlan: docs/implementation/active/NEXT-RELEASES.md
pendingManualGate: "EVIDENCE_GATE not approved — blocks 6.32.0; C10 Elastic --live; Collector Docker"
worktreeIgnoreOnly:
  - .redstamp/
  - redstamp-proposal-issue-body.md
```

## Published baseline

**6.31.17** — W26 sensitive-key complete-marker hardening + Windows `--policy` drive paths (#473); all 18 packages on npm.

## Disposition ledger (2026-10-07)

| Item | Status |
| --- | --- |
| 6.31.12–6.31.17 | **published** |
| W26 + Windows #473 | **shipped in 6.31.17** |
| W03 packed-matrix honesty | **done** (docs; #209 kept open) |
| W01 residual (#481–#483) | **in progress** (repo-only) |
| Demo #3–#5 | **W02** after W01 |
| C10 / Collector Docker | **W22** credential/environment gated |
| 6.32.0 | **BLOCKED_ON_EXTERNAL_EVIDENCE** |

## Stop marker

```text
LAST_PUBLISHED_RELEASE: 6.31.17
ACTIVE: stability-after-63111 (Oct 7; post-6.31.17 W01+)
NEXT: W01 → W02; no 6.32 without EVIDENCE_GATE
V7_DECISION: NO-GO
EVIDENCE_GATE: not approved
ADOPTION_FREEZE: excluded
```
