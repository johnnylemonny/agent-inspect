# Current task

```yaml
executionMode: maintainer-reviewed
namedTrain: stability-after-63111
currentTrain: stability-after-63111
trainStatus: "6.31.28 published; 6.31.29 recipe evidence integrity pending Version Packages; 6.32 blocked"
currentChunk: "recipe evidence integrity (#492/#486/Nest privacy) → Version Packages"
nextAction: "Merge Version Packages for 6.31.29 after CI green; then chunk 03 Nest consumption; hold Indu/Swapnil/João/email; no 6.32 without EVIDENCE_GATE"
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

**6.31.28** — all 18 packages on npm (Trusted Publish [40939596146](https://github.com/rajudandigam/agent-inspect/actions/runs/40939596146); Version Packages [#512](https://github.com/rajudandigam/agent-inspect/pull/512); starter order `e65e9445` / merge `d17618d9`).

## Shipped in 6.31.27 (timeout-ledger verifier)

| Chunk | Status | Proof |
| --- | --- | --- |
| Saved-trace verdicts; amount mismatch stays fail when the join is valid | **published** | TE join=valid args=mismatch; TF join=invalid args=match |
| Missing observer/claim stay unknown and do not hide a duplicate effect | **published** | T03, TH, TJ, TK, TL |

## Shipped in 6.31.28 (starter order relation)

| Chunk | Status | Proof |
| --- | --- | --- |
| Typed `steps.orderRelations` on the broken-agent starter | **published** | S01 pass; S02 only `contract.step.orderRelation.0`; S06 repeated retrieve pass |

## Pending 6.31.29 (recipe evidence integrity)

| Chunk | Status | Proof |
| --- | --- | --- |
| #492 same-run windows/claims, marker-id equality, twelve saved probes | **code + changeset** | recipe start; probes non-pass |
| #486 one-pass 13 executions + independent verify-saved/tampers | **code + changeset** | G01–G07 classes; fresh-process verify |
| Nest opaque `op-ref`/`tref`/`rref`; privacy N07 local/share/strict | **code + changeset** | N01–N07 |
| Canonical roadmap pointer sync to 6.31.27+ | **code** | ROADMAP / NEXT-RELEASES / EXECUTION-PLAN |

## Honesty

#492 / #486 stay open until partner acceptance beyond the recipe matrix. #494 stays open. Next after 6.31.29 publish: chunk 03 Nest consumption. No email / no 6.32.

## Stop marker

```text
LAST_PUBLISHED_RELEASE: 6.31.28
PENDING_PUBLISH: 6.31.29
ACTIVE: Version Packages → Trusted Publish for recipe evidence integrity
NEXT: chunk 03 Nest consumption; no 6.32 without EVIDENCE_GATE
V7_DECISION: NO-GO
EVIDENCE_GATE: not approved
ADOPTION_FREEZE: excluded
```
