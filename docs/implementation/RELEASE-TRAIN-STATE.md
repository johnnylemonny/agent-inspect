# Release train state

> Operational pointer only. Git state, package manifests, tests, npm, tags, GitHub releases, and CI are authoritative.
>
> **Canonical roadmap:** [ROADMAP.md](./ROADMAP.md)

```yaml
baselineVersion: "6.31.15"
publishedVersion: "6.31.15"
pendingPublishVersion: null
currentTrain: "stability-after-63111"
trainStatus: "reopened-incomplete-acceptance"
executionMode: "maintainer-reviewed"
namedTrain: "stability-after-63111"
branch: "main"
currentChunk: "C00 ledger reopen after 6.31.15 closure audit; next C01"
lastConfirmedCommit: "5c58b9f1"
lastValidationLevel: "6.31.15 published; closure audit reopened C01/C07–C09/C11"
nextAction: "C01 Promptfoo exact assertions → 6.31.16; then C07–C09, C11; no 6.32 without EVIDENCE_GATE"
pendingManualGate: "EVIDENCE_GATE not approved; Elastic --live (C10); demo D03–D07"
githubIssues:
  "450": "open — permission granted; private v3 qualified; partner Revera pending"
  "437": "open — receipt/idempotency; later evidence train"
  "209": "open — packed OS/Node matrix"
canonicalRoadmap: "docs/implementation/ROADMAP.md"
activePlan: "docs/implementation/active/NEXT-RELEASES.md"
completedChunks:
  - "6.31.15 C11–C12 matrix docs published (#478) — acceptance incomplete per audit"
  - "6.31.14 C07–C09 identity published (#477) — selected fields / live path incomplete"
  - "6.31.13 C04–C06 (#476) — verified"
  - "6.31.12 C00–C03 (#474) — suite/OpenAI boundary verified; Promptfoo assertions incomplete"
queuedChunks:
  - "C00 ledger reopen (this)"
  - "C01 Promptfoo exact assertions (6.31.16)"
  - "C07 selected-field comparator"
  - "C08 Collector attrs + NDJSON merge (6.31.17)"
  - "C09 Elastic live-path controls (6.31.18)"
  - "C11 CI wiring + OpenAI maintained tests + docs (6.31.19)"
  - "C10 actual Elastic when credentials available"
  - "Demo D03–D07 (separate repo)"
  - "6.32.0 external-evidence gate (BLOCKED)"
blockedTrains:
  - "v7.0.0 (assessment only — V7_DECISION: NO-GO)"
  - "6.32.0 until EVIDENCE_GATE approved"
amendments:
  - "Adoption freeze excluded"
  - "2026-09-28 closure audit: reopen C01, C07–C09, C11; keep verified core fixes"
worktreeIgnoreOnly:
  - ".redstamp/"
  - "redstamp-proposal-issue-body.md"
stopMarker: |
  LAST_PUBLISHED_RELEASE: 6.31.15
  ACTIVE: stability-after-63111 (reopened incomplete acceptance)
  NEXT: C01 → 6.31.16; EVIDENCE_GATE required before any 6.32 Changeset
  V7_DECISION: NO-GO
  EVIDENCE_GATE: not approved
  ADOPTION_FREEZE: excluded
updatedAt: "2026-09-28"
```
