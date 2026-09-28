# Release train state

> Operational pointer only. Git state, package manifests, tests, npm, tags, GitHub releases, and CI are authoritative.
>
> **Canonical roadmap:** [ROADMAP.md](./ROADMAP.md)

```yaml
baselineVersion: "6.31.13"
publishedVersion: "6.31.13"
pendingPublishVersion: "6.31.14"
currentTrain: "stability-after-63111"
trainStatus: "active"
executionMode: "autonomous-release-train"
namedTrain: "stability-after-63111"
branch: "main"
currentChunk: "C07–C09 transport verifiers for 6.31.14"
lastConfirmedCommit: "dc00cc29"
lastValidationLevel: "npm 6.31.13 all 18 packages confirmed"
nextAction: "Push C07–C09 + changeset; Version Packages; Trusted Publish 6.31.14"
pendingManualGate: "Elastic --live credentials; EVIDENCE_GATE not approved; demo D03–D07; 6.32 external acceptance"
githubIssues:
  "450": "open — permission granted; private v3 qualified; partner Revera pending"
  "437": "open — receipt/idempotency; later evidence train"
  "209": "open — packed OS/Node matrix"
canonicalRoadmap: "docs/implementation/ROADMAP.md"
activePlan: "docs/implementation/active/NEXT-RELEASES.md"
completedChunks:
  - "6.31.13 C04–C06 (#476)"
  - "6.31.12 C00–C03 (#474 + republish)"
queuedChunks:
  - "C07–C09 (shipping as 6.31.14); C10 Elastic blocked"
  - "C11–C12 (proposed 6.31.15)"
  - "6.32.0 external-evidence gate"
blockedTrains:
  - "v7.0.0 (assessment only — V7_DECISION: NO-GO)"
  - "6.32.0 until EVIDENCE_GATE approved"
amendments:
  - "Adoption freeze excluded"
  - "Publish if tightened to avoid false-positive on commits mentioning Version Packages"
worktreeIgnoreOnly:
  - ".redstamp/"
  - "redstamp-proposal-issue-body.md"
stopMarker: |
  LAST_PUBLISHED_RELEASE: 6.31.13
  ACTIVE: stability-after-63111
  NEXT: publish 6.31.14 then C11–C12
  V7_DECISION: NO-GO
  EVIDENCE_GATE: not approved
  ADOPTION_FREEZE: excluded
updatedAt: "2026-09-28"
```
