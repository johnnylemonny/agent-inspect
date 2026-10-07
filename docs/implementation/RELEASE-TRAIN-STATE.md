# Release train state

> Operational pointer only. Git state, package manifests, tests, npm, tags, GitHub releases, and CI are authoritative.
>
> **Canonical roadmap:** [ROADMAP.md](./ROADMAP.md)

```yaml
baselineVersion: "6.31.17"
publishedVersion: "6.31.17"
pendingPublishVersion: null
currentTrain: "stability-after-63111"
trainStatus: "6.31.17 published; W01 residual verifiers"
executionMode: "maintainer-reviewed"
namedTrain: "stability-after-63111"
branch: "main"
currentChunk: "W01 Promptfoo/OTLP/kit (#481–#483)"
lastConfirmedCommit: "071de49d"
lastValidationLevel: "6.31.17 Version Packages #493; publish 37671109645; ALL 18 OK on npm"
nextAction: "Land W01 repo-only; W02 demo; skip empty 6.31.18+; no 6.32 without EVIDENCE_GATE"
pendingManualGate: "EVIDENCE_GATE not approved; Elastic --live (C10); Collector Docker"
githubIssues:
  "481": "open — Promptfoo exact answer/failure identity (W01)"
  "482": "open — OTLP typed AnyValues (W01)"
  "483": "open — kit resolved pin (W01)"
  "490": "open — packed-matrix honesty noted; keep #209 open"
  "209": "open — packed OS/Node matrix; keep open"
  "491": "open — Oct 7 W-pack / privacy marker (W26 shipped in 6.31.17)"
  "492": "open — Oct 7 train tracking"
  "450": "open — permission granted; private v3 qualified; partner Revera pending"
  "437": "open — receipt/idempotency; later evidence train"
canonicalRoadmap: "docs/implementation/ROADMAP.md"
activePlan: "docs/implementation/active/NEXT-RELEASES.md"
completedChunks:
  - "6.31.17 W26 marker + Windows #473 (#493 publish)"
  - "W00 Oct 7 reconcile"
  - "W03 packed-matrix honesty wording"
  - "Demo pin → 6.31.16 (proactive-ai-demo #2)"
  - "Demo D03–D07 (proactive-ai-demo #1)"
  - "6.31.16 C01+C07–C09+C11 reopen (#479)"
queuedChunks:
  - "W01 Promptfoo/OTLP/kit residual (#481–#483)"
  - "W02 demo #3–#5"
  - "W22 C10 Elastic / Collector Docker when credentials"
  - "6.32.0 external-evidence gate (BLOCKED)"
blockedTrains:
  - "v7.0.0 (assessment only — V7_DECISION: NO-GO)"
  - "6.32.0 until EVIDENCE_GATE approved"
amendments:
  - "Adoption freeze excluded"
  - "2026-10-07 6.31.17 published; next work is repo-only W01+"
worktreeIgnoreOnly:
  - ".redstamp/"
  - "redstamp-proposal-issue-body.md"
stopMarker: |
  LAST_PUBLISHED_RELEASE: 6.31.17
  ACTIVE: stability-after-63111 (Oct 7; post-6.31.17)
  NEXT: W01 → W02; no 6.32 without EVIDENCE_GATE
  V7_DECISION: NO-GO
  EVIDENCE_GATE: not approved
  ADOPTION_FREEZE: excluded
updatedAt: "2026-10-07"
```
