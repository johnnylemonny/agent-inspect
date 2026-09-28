# Release train state

> Operational pointer only. Git state, package manifests, tests, npm, tags, GitHub releases, and CI are authoritative.
>
> **Canonical roadmap:** [ROADMAP.md](./ROADMAP.md)

```yaml
baselineVersion: "6.31.11"
publishedVersion: "6.31.11"
pendingPublishVersion: "6.31.12"
currentTrain: "stability-after-63111"
trainStatus: "active"
executionMode: "autonomous-release-train"
namedTrain: "stability-after-63111"
branch: "main"
currentChunk: "Push C00–C03 + changeset for 6.31.12"
lastConfirmedCommit: "f88796aa"
lastValidationLevel: "coverage + fixtures + pack:smoke + test:all + size"
nextAction: "Merge Version Packages PR; Trusted Publish 6.31.12; then C04–C06"
pendingManualGate: "Elastic --live credentials; EVIDENCE_GATE not approved; demo D03–D07; 6.32 external acceptance"
githubIssues:
  "450": "open — permission granted; private v3 qualified; partner Revera pending"
  "437": "open — receipt/idempotency; later evidence train"
  "209": "open — packed OS/Node matrix"
canonicalRoadmap: "docs/implementation/ROADMAP.md"
activePlan: "docs/implementation/active/NEXT-RELEASES.md"
completedChunks:
  - "C00–C03 local implementation (ready to publish as 6.31.12)"
  - "6.31.11 C06–C13 suite/capture trust follow-through (#470/#471)"
  - "6.31.10 API misuse diagnostics (#467/#468)"
  - "6.31.9 suite assertion integrity + CJS context (#464/#465)"
  - "6.31.8 integration honesty (#462/#463)"
queuedChunks:
  - "C04–C06 (proposed 6.31.13)"
  - "C07–C09 (proposed 6.31.14); C10 Elastic blocked"
  - "Demo D03–D07"
  - "C11–C12 (proposed 6.31.15)"
  - "6.32.0 external-evidence gate"
blockedTrains:
  - "v7.0.0 (assessment only — V7_DECISION: NO-GO)"
  - "6.32.0 until EVIDENCE_GATE approved"
amendments:
  - "Adoption freeze excluded"
  - "Stability package chunk IDs (C00–C12) are a new numbering; prior suite-trust C01–C13 are historical closures"
  - "Maintainer authorized autonomous train through publish toward 6.32; EVIDENCE_GATE still required for 6.32"
worktreeIgnoreOnly:
  - ".redstamp/"
  - "redstamp-proposal-issue-body.md"
stopMarker: |
  LAST_PUBLISHED_RELEASE: 6.31.11
  ACTIVE: stability-after-63111
  NEXT: publish 6.31.12 then C04–C06
  V7_DECISION: NO-GO
  EVIDENCE_GATE: not approved
  ADOPTION_FREEZE: excluded
updatedAt: "2026-09-28"
```
