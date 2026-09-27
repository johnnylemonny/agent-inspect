# Release train state

> Operational pointer only. Git state, package manifests, tests, npm, tags, GitHub releases, and CI are authoritative.
>
> **Canonical roadmap:** [ROADMAP.md](./ROADMAP.md)

```yaml
baselineVersion: "6.31.10"
publishedVersion: "6.31.10"
pendingPublishVersion: null
currentTrain: "suite-context-trust-after-6318"
trainStatus: "active"
executionMode: "maintainer-reviewed"
namedTrain: "suite-context-trust-after-6318"
branch: "main"
currentChunk: "C06 explain logical lifecycle counts (next)"
lastConfirmedCommit: "8dfa797e"
lastValidationLevel: "publish 36300814181 success; npm 6.31.10"
nextAction: "Implement C06 explain lifecycle consistency"
pendingManualGate: "Elastic --live credentials; external Promptfoo reproduction; EVIDENCE_GATE not approved; proactive-ai-demo C03–C04; D01 docs"
canonicalRoadmap: "docs/implementation/ROADMAP.md"
activePlan: "docs/implementation/active/NEXT-RELEASES.md"
completedChunks:
  - "6.31.10 API misuse diagnostics (#467/#468)"
  - "6.31.9 suite assertion integrity + CJS context (#464/#465)"
  - "6.31.8 integration honesty (#462/#463)"
queuedChunks:
  - "C06 explain logical lifecycle counts"
  - "C07 rule/outcome summary clarity"
  - "C08–C12"
  - "C13 broader consumers (split)"
  - "Demo C03–C04"
  - "D01 docs/examples capture package"
blockedTrains:
  - "v7.0.0 (assessment only — V7_DECISION: NO-GO)"
stopMarker: |
  LAST_PUBLISHED_RELEASE: 6.31.10
  ACTIVE: suite-context-trust-after-6318
  NEXT: C06 explain logical lifecycle counts
  V7_DECISION: NO-GO
  EVIDENCE_GATE: not approved
  ADOPTION_FREEZE: excluded
updatedAt: "2026-09-27"
```
