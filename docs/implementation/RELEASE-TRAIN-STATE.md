# Release train state

> Operational pointer only. Git state, package manifests, tests, npm, tags, GitHub releases, and CI are authoritative.
>
> **Canonical roadmap:** [ROADMAP.md](./ROADMAP.md)

```yaml
baselineVersion: "6.31.15"
publishedVersion: "6.31.15"
pendingPublishVersion: null
currentTrain: "stability-after-63111"
trainStatus: "halted-at-external-gate"
executionMode: "maintainer-reviewed"
namedTrain: "stability-after-63111"
branch: "main"
currentChunk: "Stability C00–C12 patch slots shipped through 6.31.15; 6.32 blocked"
lastConfirmedCommit: "a6b2e52d"
lastValidationLevel: "6.31.15 Version Packages #478; publish 36468947160 + republish 36471364150; ALL 18 OK on npm"
nextAction: "STOP — no 6.32 Changeset without EVIDENCE_GATE; optional C10 Elastic --live when credentials available"
pendingManualGate: "EVIDENCE_GATE not approved; Elastic --live (C10); demo D03–D07"
githubIssues:
  "450": "open — permission granted; private v3 qualified; partner Revera pending"
  "437": "open — receipt/idempotency; later evidence train"
  "209": "open — packed OS/Node matrix"
canonicalRoadmap: "docs/implementation/ROADMAP.md"
activePlan: "docs/implementation/active/NEXT-RELEASES.md"
completedChunks:
  - "6.31.15 C11–C12 (#478)"
  - "6.31.14 C07–C09 (#477)"
  - "6.31.13 C04–C06 (#476)"
  - "6.31.12 C00–C03 (#474)"
queuedChunks:
  - "6.32.0 external-evidence gate (BLOCKED)"
  - "C10 actual Elastic when credentials available"
  - "Demo D03–D07 (separate repo)"
blockedTrains:
  - "v7.0.0 (assessment only — V7_DECISION: NO-GO)"
  - "6.32.0 until EVIDENCE_GATE approved"
amendments:
  - "Adoption freeze excluded"
  - "Maintainer authorized publish through stability patches; 6.32 requires separate external acceptance"
worktreeIgnoreOnly:
  - ".redstamp/"
  - "redstamp-proposal-issue-body.md"
stopMarker: |
  LAST_PUBLISHED_RELEASE: 6.31.15
  ACTIVE: stability-after-63111 (halted at external gate)
  NEXT: EVIDENCE_GATE worksheet required before any 6.32 Changeset
  V7_DECISION: NO-GO
  EVIDENCE_GATE: not approved
  ADOPTION_FREEZE: excluded
updatedAt: "2026-09-28"
```
