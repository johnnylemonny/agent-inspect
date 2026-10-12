# Current task

```yaml
executionMode: maintainer-reviewed
namedTrain: stability-after-63111
currentTrain: stability-after-63111
trainStatus: "committing post-6.31.20 boundaries for 6.31.21; 6.32 blocked"
currentChunk: "6.31.21 MCP compose + SDK types + Roy O05 redelivery"
nextAction: "Version Packages → Trusted Publish 6.31.21; hold F12/Swapnil/João/email/#494/#98"
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

## Post-6.31.20 remaining boundaries (shipping as 6.31.21)

| Chunk | Status | Proof |
| --- | --- | --- |
| 1 MCP options + metadata compose | **ready** | unit + packed M12 |
| 2 Strict SDK Client types + negatives | **ready** | packed `.mts`/`.cts`; M13/M14 |
| 3 Roy O05 repeated-delivery | **ready** | retry-safety collapse; f04 both ceilings |
| Manual holds | **held** | Indu v3; Swapnil #437; João; Mikhail #494; plumbline #98; email |

## Honesty

Mikhail full MCP closure and Roy full conformance remain open after these narrow fixes. No email / no 6.32.

## Stop marker

```text
LAST_PUBLISHED_RELEASE: 6.31.20
ACTIVE: 6.31.21 release train
NEXT: Version Packages → Trusted Publish; no 6.32 without EVIDENCE_GATE
V7_DECISION: NO-GO
EVIDENCE_GATE: not approved
ADOPTION_FREEZE: excluded
```
