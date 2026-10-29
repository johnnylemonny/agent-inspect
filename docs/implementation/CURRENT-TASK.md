# Current task

```yaml
executionMode: maintainer-reviewed
namedTrain: stability-after-63111
currentTrain: stability-after-63111
trainStatus: "6.31.29 published; 6.32 blocked"
currentChunk: "03 Nest consumption from saved evidence — next"
nextAction: "Implement chunk 03 Nest SupportService consumption verifier; hold Indu/Swapnil/João/email; no 6.32 without EVIDENCE_GATE"
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

## Shipped in 6.31.28 (starter order relation)

| Chunk | Status | Proof |
| --- | --- | --- |
| Typed `steps.orderRelations` on the broken-agent starter | **published** | S01 pass; S02 only `contract.step.orderRelation.0`; S06 repeated retrieve pass |

## Shipped in 6.31.29 (recipe evidence integrity)

| Chunk | Status | Proof |
| --- | --- | --- |
| #492 same-run windows/claims, marker-id equality, twelve saved probes | **published** | recipe start; probes non-pass |
| #486 one-pass 13 executions + independent verify-saved/tampers | **published** | G01–G07; fresh-process verify |
| Nest opaque `op-ref`/`tref`/`rref`; privacy N07 | **published** | N01–N07 |
| Canonical roadmap pointer sync | **published** | ROADMAP / NEXT-RELEASES / EXECUTION-PLAN |

## Honesty

#492 / #486 stay open until partner acceptance beyond the recipe matrix. #494 stays open. Next: chunk 03 Nest consumption. No email / no 6.32.

## Stop marker

```text
LAST_PUBLISHED_RELEASE: 6.31.29
PENDING_PUBLISH: none
ACTIVE: chunk 03 Nest consumption from saved evidence
NEXT: residual partner packets; no 6.32 without EVIDENCE_GATE
V7_DECISION: NO-GO
EVIDENCE_GATE: not approved
ADOPTION_FREEZE: excluded
```
