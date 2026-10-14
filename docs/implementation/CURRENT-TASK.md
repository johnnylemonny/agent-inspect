# Current task

```yaml
executionMode: maintainer-reviewed
namedTrain: stability-after-63111
currentTrain: stability-after-63111
trainStatus: "committing Prompt A identity fidelity for 6.31.22; 6.32 blocked"
currentChunk: "6.31.22 Prompt A identity fidelity (#484)"
nextAction: "Version Packages → Trusted Publish 6.31.22; hold Indu/Swapnil/João/#494/#98/email"
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

**6.31.21** — all 18 packages on npm (Trusted Publish [38204663903](https://github.com/rajudandigam/agent-inspect/actions/runs/38204663903)).

## Shipping as 6.31.22 (Prompt A / #484)

| Chunk | Status | Proof |
| --- | --- | --- |
| Opaque eventId + semantic redelivery fingerprint | **ready** | A03–A08, A10; recovery-ops aligned |
| Tree/export same-ID conflict retention | **ready** | delivery_conflict marker |
| Direct/nested identity conflict on OTLP round-trip | **ready** | identity_conflict.*; A14–A15; f04 |
| Manual holds | **held** | Indu v3; Swapnil #437; João; Mikhail #494; plumbline #98; email |

## Honesty

Full #484 issue closure still needs the remaining W04 partner-packet acceptance items beyond this matrix. No email / no 6.32.

## Stop marker

```text
LAST_PUBLISHED_RELEASE: 6.31.21
ACTIVE: 6.31.22 release train (Prompt A)
NEXT: Version Packages → Trusted Publish; no 6.32 without EVIDENCE_GATE
V7_DECISION: NO-GO
EVIDENCE_GATE: not approved
ADOPTION_FREEZE: excluded
```
