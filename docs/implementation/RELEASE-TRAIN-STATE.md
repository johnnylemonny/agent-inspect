# Release train state

> Operational pointer only. Git state, package manifests, tests, npm, tags, GitHub releases, and CI are authoritative.
>
> **Canonical roadmap:** [ROADMAP.md](./ROADMAP.md)

```yaml
baselineVersion: "6.31.17"
publishedVersion: "6.31.17"
pendingPublishVersion: null
currentTrain: "stability-after-63111"
trainStatus: "6.31.17 published; W01 landed; W02 #3 PR open"
executionMode: "maintainer-reviewed"
namedTrain: "stability-after-63111"
branch: "main"
currentChunk: "W02 proactive-ai-demo #6 (issue #3); #4/#5 next"
lastConfirmedCommit: "9bf8859e"
lastValidationLevel: "6.31.17 all 18 on npm; W01 integration-offline green"
nextAction: "Finish demo #3–#5; skip empty patches; no 6.32 without EVIDENCE_GATE"
pendingManualGate: "EVIDENCE_GATE not approved; Elastic --live (C10); Collector Docker"
githubIssues:
  "481": "closed — W01 Promptfoo identity (9bf8859e)"
  "482": "closed — W01 OTLP AnyValues (9bf8859e)"
  "483": "closed — W01 kit resolved pin (9bf8859e)"
  "490": "open — packed-matrix honesty noted; keep #209 open"
  "209": "open — packed OS/Node matrix; keep open"
  "491": "open — Oct 7 W-pack / privacy marker (W26 shipped in 6.31.17)"
  "492": "open — Oct 7 train tracking"
  "450": "open — permission granted; private v3 qualified; partner Revera pending"
  "437": "open — receipt/idempotency; later evidence train"
canonicalRoadmap: "docs/implementation/ROADMAP.md"
activePlan: "docs/implementation/active/NEXT-RELEASES.md"
completedChunks:
  - "W01 Promptfoo/OTLP/kit (9bf8859e)"
  - "6.31.17 W26 marker + Windows #473 (#493 publish)"
  - "W00 Oct 7 reconcile"
  - "W03 packed-matrix honesty wording"
  - "Demo pin → 6.31.16 (proactive-ai-demo #2)"
  - "Demo D03–D07 (proactive-ai-demo #1)"
  - "6.31.16 C01+C07–C09+C11 reopen (#479)"
queuedChunks:
  - "W02 demo #3 (PR #6) then #4–#5"
  - "W11 skipped unless public recovery false-pass reproduces"
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
