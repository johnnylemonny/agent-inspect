# Release train state

> Operational pointer only. Git state, package manifests, tests, npm, tags, GitHub releases, and CI are authoritative.
>
> **Canonical roadmap:** [ROADMAP.md](./ROADMAP.md)

```yaml
baselineVersion: "6.31.11"
publishedVersion: "6.31.11"
pendingPublishVersion: null
currentTrain: "suite-context-trust-after-6318"
trainStatus: "active"
executionMode: "maintainer-reviewed"
namedTrain: "suite-context-trust-after-6318"
branch: "main"
currentChunk: "C06–C13 (implemented; pending publish)"
lastConfirmedCommit: "c1810fb7"
lastValidationLevel: "local C06–C13 implementation pending full chunk gate"
nextAction: "Changeset patch for C06–C13; Trusted Publish; then demo C03–C04 / D01"
pendingManualGate: "Elastic --live credentials; external Promptfoo reproduction; EVIDENCE_GATE not approved; proactive-ai-demo C03–C04; D01 docs"
canonicalRoadmap: "docs/implementation/ROADMAP.md"
activePlan: "docs/implementation/active/NEXT-RELEASES.md"
completedChunks:
  - "6.31.10 API misuse diagnostics (#467/#468)"
  - "6.31.9 suite assertion integrity + CJS context (#464/#465)"
  - "6.31.8 integration honesty (#462/#463)"
queuedChunks:
  - "C06–C13 publish"
  - "Demo C03–C04 (proactive-ai-demo)"
  - "D01 docs/examples capture package"
blockedTrains:
  - "v7.0.0 (assessment only — V7_DECISION: NO-GO)"
stopMarker: |
  LAST_PUBLISHED_RELEASE: 6.31.10
  ACTIVE: suite-context-trust-after-6318
  NEXT: publish C06–C13
  V7_DECISION: NO-GO
  EVIDENCE_GATE: not approved
  ADOPTION_FREEZE: excluded
updatedAt: "2026-09-27"
```
