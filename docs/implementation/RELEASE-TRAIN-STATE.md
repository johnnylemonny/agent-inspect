# Release train state

> Operational pointer only. Git state, package manifests, tests, npm, tags, GitHub releases, and CI are authoritative.
>
> **Canonical roadmap:** [ROADMAP.md](./ROADMAP.md)

```yaml
baselineVersion: "6.31.14"
publishedVersion: "6.31.14"
pendingPublishVersion: "6.31.15"
currentTrain: "stability-after-63111"
trainStatus: "active"
executionMode: "autonomous-release-train"
namedTrain: "stability-after-63111"
branch: "main"
currentChunk: "C11–C12 matrix + docs consolidation for 6.31.15"
lastConfirmedCommit: "66c9c197"
lastValidationLevel: "npm 6.31.14 all 18 packages confirmed"
nextAction: "Push C11–C12 + changeset; Version Packages; Trusted Publish 6.31.15; STOP before 6.32"
pendingManualGate: "EVIDENCE_GATE not approved; Elastic --live; demo D03–D07"
githubIssues:
  "450": "open — permission granted; private v3 qualified; partner Revera pending"
  "437": "open — receipt/idempotency; later evidence train"
  "209": "open — packed OS/Node matrix"
canonicalRoadmap: "docs/implementation/ROADMAP.md"
activePlan: "docs/implementation/active/NEXT-RELEASES.md"
completedChunks:
  - "6.31.14 C07–C09 (#477)"
  - "6.31.13 C04–C06 (#476)"
  - "6.31.12 C00–C03 (#474)"
queuedChunks:
  - "C11–C12 (shipping as 6.31.15)"
  - "6.32.0 external-evidence gate (BLOCKED)"
blockedTrains:
  - "v7.0.0 (assessment only — V7_DECISION: NO-GO)"
  - "6.32.0 until EVIDENCE_GATE approved"
amendments:
  - "Adoption freeze excluded"
  - "C10 actual Elastic remains pending credentials"
worktreeIgnoreOnly:
  - ".redstamp/"
  - "redstamp-proposal-issue-body.md"
stopMarker: |
  LAST_PUBLISHED_RELEASE: 6.31.14
  ACTIVE: stability-after-63111
  NEXT: publish 6.31.15 then halt — EVIDENCE_GATE required for 6.32
  V7_DECISION: NO-GO
  EVIDENCE_GATE: not approved
  ADOPTION_FREEZE: excluded
updatedAt: "2026-09-28"
```
