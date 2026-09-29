# Release train state

> Operational pointer only. Git state, package manifests, tests, npm, tags, GitHub releases, and CI are authoritative.
>
> **Canonical roadmap:** [ROADMAP.md](./ROADMAP.md)

```yaml
baselineVersion: "6.31.16"
publishedVersion: "6.31.16"
pendingPublishVersion: null
currentTrain: "stability-after-63111"
trainStatus: "halted-at-external-gate"
executionMode: "maintainer-reviewed"
namedTrain: "stability-after-63111"
branch: "main"
currentChunk: "6.31.16 published; demo pin 6.31.16 merged; 6.32 blocked"
lastConfirmedCommit: "5b73001c"
lastValidationLevel: "6.31.16 Version Packages #479; publish 36484978078 + republish 36486443360; ALL 18 OK on npm; demo D03–D07 #1 + pin 6.31.16 #2 merged"
nextAction: "STOP — no 6.32 Changeset without EVIDENCE_GATE; C10 Elastic --live when credentials; Collector Docker when environment available"
pendingManualGate: "EVIDENCE_GATE not approved; Elastic --live (C10); Collector Docker"
githubIssues:
  "450": "open — permission granted; private v3 qualified; partner Revera pending"
  "437": "open — receipt/idempotency; later evidence train"
  "209": "open — packed OS/Node matrix"
canonicalRoadmap: "docs/implementation/ROADMAP.md"
activePlan: "docs/implementation/active/NEXT-RELEASES.md"
completedChunks:
  - "Demo pin → 6.31.16 (proactive-ai-demo #2)"
  - "Demo D03–D07 (proactive-ai-demo #1)"
  - "6.31.16 C01+C07–C09+C11 reopen (#479)"
  - "6.31.15 C11–C12 matrix docs (#478) — acceptance completed in 6.31.16"
  - "6.31.14 C07–C09 identity (#477) — selected fields/live path completed in 6.31.16"
  - "6.31.13 C04–C06 (#476)"
  - "6.31.12 C00–C03 (#474)"
queuedChunks:
  - "6.32.0 external-evidence gate (BLOCKED)"
  - "C10 actual Elastic when credentials available"
  - "Collector Docker live when environment available"
blockedTrains:
  - "v7.0.0 (assessment only — V7_DECISION: NO-GO)"
  - "6.32.0 until EVIDENCE_GATE approved"
amendments:
  - "Adoption freeze excluded"
  - "2026-09-28 closure audit reopen shipped as 6.31.16"
worktreeIgnoreOnly:
  - ".redstamp/"
  - "redstamp-proposal-issue-body.md"
stopMarker: |
  LAST_PUBLISHED_RELEASE: 6.31.16
  ACTIVE: stability-after-63111 (halted at external gate)
  NEXT: EVIDENCE_GATE worksheet required before any 6.32 Changeset
  V7_DECISION: NO-GO
  EVIDENCE_GATE: not approved
  ADOPTION_FREEZE: excluded
updatedAt: "2026-09-28"
```
