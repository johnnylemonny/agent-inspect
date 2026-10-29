# Current task

```yaml
executionMode: maintainer-reviewed
namedTrain: stability-after-63111
currentTrain: stability-after-63111
trainStatus: "6.31.29 published; chunks 03–04 on main pending publish; 6.32 blocked"
currentChunk: "05 Om observed readiness/wait diagnostics — next"
nextAction: "Implement chunk 05 Om readiness/wait diagnostics; hold Indu/Swapnil/João/email; no 6.32 without EVIDENCE_GATE"
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
| Nest SupportService consumption from saved evidence | **code ready** | N01–N08; verify-cli; tamper |
| HTML lifecycle presentation join + CLI `steps.orderRelations` docs | **code ready** | html-exporter tests; CLI.md |

## Honesty

#492 / #486 stay open until partner acceptance. #494 stays open. Next: chunk 05. No email / no 6.32.

## Stop marker

```text
LAST_PUBLISHED_RELEASE: 6.31.29
PENDING_PUBLISH: chunks 03–04 (Nest consumption; HTML lifecycle + CLI steps docs)
ACTIVE: chunk 05 Om observed readiness/wait diagnostics
NEXT: residual partner packets; no 6.32 without EVIDENCE_GATE
V7_DECISION: NO-GO
EVIDENCE_GATE: not approved
ADOPTION_FREEZE: excluded
```
