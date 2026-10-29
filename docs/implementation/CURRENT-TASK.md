# Current task

```yaml
executionMode: maintainer-reviewed
namedTrain: stability-after-63111
currentTrain: stability-after-63111
trainStatus: "6.31.29 published; chunk 03 Nest consumption on main pending publish; 6.32 blocked"
currentChunk: "04 HTML lifecycle + CLI steps docs — next"
nextAction: "Implement chunk 04 HTML lifecycle reproduce/fix + CLI steps docs; hold Indu/Swapnil/João/email; no 6.32 without EVIDENCE_GATE"
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

**6.31.29** — all 18 packages on npm (Trusted Publish [40943406555](https://github.com/rajudandigam/agent-inspect/actions/runs/40943406555); Version Packages [#514](https://github.com/rajudandigam/agent-inspect/pull/514); code `dcd714dc` / merge `40a6f4ff`).

## Implemented on main (pending Version Packages)

| Chunk | Status | Proof |
| --- | --- | --- |
| Nest SupportService consumption from saved evidence | **code ready** | N01–N08; N02 structure pass + consumption fail; verify-cli; tamper |

## Shipped in 6.31.29 (recipe evidence integrity)

| Chunk | Status | Proof |
| --- | --- | --- |
| #492 same-run windows/claims, marker-id equality, twelve saved probes | **published** | recipe start; probes non-pass |
| #486 one-pass 13 executions + independent verify-saved/tampers | **published** | G01–G07; fresh-process verify |
| Nest opaque `op-ref`/`tref`/`rref`; privacy N07 | **published** | N01–N07 |
| Canonical roadmap pointer sync | **published** | ROADMAP / NEXT-RELEASES / EXECUTION-PLAN |

## Honesty

#492 / #486 stay open until partner acceptance beyond the recipe matrix. #494 stays open. Next: chunk 04. No email / no 6.32.

## Stop marker

```text
LAST_PUBLISHED_RELEASE: 6.31.29
PENDING_PUBLISH: nest consumption verifier (chunk 03)
ACTIVE: chunk 04 HTML lifecycle + CLI steps docs
NEXT: residual partner packets; no 6.32 without EVIDENCE_GATE
V7_DECISION: NO-GO
EVIDENCE_GATE: not approved
ADOPTION_FREEZE: excluded
```
