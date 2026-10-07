# Release train state

> Operational pointer only. Git state, package manifests, tests, npm, tags, GitHub releases, and CI are authoritative.
>
> **Canonical roadmap:** [ROADMAP.md](./ROADMAP.md)

```yaml
baselineVersion: "6.31.17"
publishedVersion: "6.31.17"
pendingPublishVersion: "6.31.17"
currentTrain: "stability-after-63111"
trainStatus: "compose 6.31.17; awaiting CI / Version Packages / publish"
executionMode: "maintainer-reviewed"
namedTrain: "stability-after-63111"
branch: "main"
currentChunk: "W26 + Windows #473 Changeset for 6.31.17; W03 matrix honesty wording"
lastConfirmedCommit: "pending-push"
lastValidationLevel: "W26 focused + build/typecheck/test/size/fixtures/pack:smoke"
nextAction: "CI → Version Packages → publish.yml; verify all 18 == 6.31.17; then W01"
pendingManualGate: "EVIDENCE_GATE not approved; Elastic --live (C10); Collector Docker"
githubIssues:
  "491": "open — Oct 7 W-pack / privacy marker (W26)"
  "492": "open — Oct 7 train tracking"
  "490": "open — packed-matrix honesty (W03); reuse, no duplicate"
  "483": "open — kit resolved pin; coordinate Swarnabha; do not block #481/#482"
  "481": "open — Promptfoo exact answer/failure identity (W01)"
  "482": "open — OTLP typed AnyValues (W01)"
  "209": "open — packed OS/Node matrix; keep open"
  "450": "open — permission granted; private v3 qualified; partner Revera pending"
  "437": "open — receipt/idempotency; later evidence train"
canonicalRoadmap: "docs/implementation/ROADMAP.md"
activePlan: "docs/implementation/active/NEXT-RELEASES.md"
completedChunks:
  - "W00 Oct 7 reconcile (docs)"
  - "Demo pin → 6.31.16 (proactive-ai-demo #2)"
  - "Demo D03–D07 (proactive-ai-demo #1)"
  - "6.31.16 C01+C07–C09+C11 reopen (#479)"
  - "6.31.15 C11–C12 matrix docs (#478)"
  - "6.31.14 C07–C09 identity (#477)"
  - "6.31.13 C04–C06 (#476)"
  - "6.31.12 C00–C03 (#474)"
queuedChunks:
  - "W26 sensitive-key complete-marker → 6.31.17 (+ merged Windows #473)"
  - "W01 Promptfoo/OTLP/kit residual (#481–#483)"
  - "W03 packed-matrix honesty (#490); keep #209 open"
  - "W02 demo #3–#5"
  - "W22 C10 Elastic / Collector Docker when credentials"
  - "6.32.0 external-evidence gate (BLOCKED)"
blockedTrains:
  - "v7.0.0 (assessment only — V7_DECISION: NO-GO)"
  - "6.32.0 until EVIDENCE_GATE approved"
amendments:
  - "Adoption freeze excluded"
  - "2026-09-28 closure audit reopen shipped as 6.31.16"
  - "2026-10-07 Oct 7 W-pack: next public patch is W26 → 6.31.17; stale C07–C11 slot labels retired"
worktreeIgnoreOnly:
  - ".redstamp/"
  - "redstamp-proposal-issue-body.md"
stopMarker: |
  LAST_PUBLISHED_RELEASE: 6.31.16
  ACTIVE: stability-after-63111 (Oct 7; next public = 6.31.17)
  NEXT: W26 → 6.31.17; W01+; no 6.32 without EVIDENCE_GATE
  V7_DECISION: NO-GO
  EVIDENCE_GATE: not approved
  ADOPTION_FREEZE: excluded
updatedAt: "2026-10-07"
```
