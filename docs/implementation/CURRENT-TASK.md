# Current task

```yaml
executionMode: maintainer-reviewed
namedTrain: stability-after-63111
currentTrain: stability-after-63111
trainStatus: "6.31.20 published (all 18); Oct 11 remaining fixes closed; 6.32 blocked"
currentChunk: "post-6.31.20 partner/gated holds"
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

## Oct 11 remaining fixes (closed in 6.31.20)

| Chunk | Status | Proof |
| --- | --- | --- |
| 1 MCP RequestOptions | **published** | `packages/mcp` unit tests; packed M09–M11; PR #494 inspected (not merged) |
| 2 Headsign ADVANCE≠COMPLETE | **published** | pin `e375f96`; H01c terminal-on-ADVANCE fails |
| 3 Keniel receipt join | **published** | comment+article join; wrong/missing → unmatched |
| 4 Roy/Gary/Shola/Navya | **published** | f04 O05 collision+replay, O06 unknown_unverifiable; stage table; retryableErrors; attempt/marker counts |
| Manual holds | **held** | Indu v3 archive; Swapnil #437 fields; João binaries; plumbline #98 re-request; email |

## Honesty

Published 6.31.20 ≠ emailed ≠ reviewer acceptance. Gated holds remain.

## Stop marker

```text
LAST_PUBLISHED_RELEASE: 6.31.20
ACTIVE: stability-after-63111 (Oct 11 remaining fixes published)
NEXT: partner packets / plumbline re-review authorize; no 6.32 without EVIDENCE_GATE
V7_DECISION: NO-GO
EVIDENCE_GATE: not approved
ADOPTION_FREEZE: excluded
```
