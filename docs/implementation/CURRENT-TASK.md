# Current task

```yaml
executionMode: maintainer-reviewed
namedTrain: stability-after-63111
currentTrain: stability-after-63111
trainStatus: "oct7-w00-reconciled; next W26 → 6.31.17"
currentChunk: "W00 reconciled at 09da2a3d; published npm 6.31.16; merged-unreleased #473+#480"
nextAction: "W26 sensitive-key marker fix → Changeset 6.31.17 (W26 + Windows #473) → Version Packages → Trusted Publish; then W01 residual verifiers"
canonicalRoadmap: docs/implementation/ROADMAP.md
activePlan: docs/implementation/active/NEXT-RELEASES.md
pendingManualGate: "EVIDENCE_GATE not approved — blocks 6.32.0; C10 Elastic --live; Collector Docker"
worktreeIgnoreOnly:
  - .redstamp/
  - redstamp-proposal-issue-body.md
```

## Published baseline

**6.31.16** — on npm (all 18 packages). Git main includes merged-unreleased Windows `--policy` (#473) and COMPARE docs (#480).

## Disposition ledger (2026-10-07)

| Item | Status |
| --- | --- |
| 6.31.12–6.31.16 | **published** |
| Windows `--policy` drive paths (#473) | **merged, unreleased** → ship in **6.31.17** |
| COMPARE / OrcaReplay (#480) | **merged, unreleased** (docs; rides with next patch if needed) |
| W26 sensitive-key complete-marker | **next code** → **6.31.17** |
| W01 residual (#481–#483) | **queued** after 6.31.17 (repo-only unless public fix required) |
| Demo #3–#5 | **W02** after W01 |
| C10 / Collector Docker | **W22** credential/environment gated |
| Packed-matrix honesty (#209/#490) | **W03** — keep #209 open |
| 6.32.0 | **BLOCKED_ON_EXTERNAL_EVIDENCE** |

## Stop marker

```text
LAST_PUBLISHED_RELEASE: 6.31.16
ACTIVE: stability-after-63111 (Oct 7 W-pack; next public = 6.31.17)
NEXT: W26 → 6.31.17; then W01+; no 6.32 without EVIDENCE_GATE
V7_DECISION: NO-GO
EVIDENCE_GATE: not approved
ADOPTION_FREEZE: excluded
```
