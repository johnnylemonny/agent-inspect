# Current task

```yaml
executionMode: maintainer-reviewed
namedTrain: integration-honesty-after-6317
currentTrain: integration-honesty-after-6317
trainStatus: active
currentChunk: "Integration honesty P1 chunks implemented locally; awaiting maintainer review / Changeset publish"
nextAction: "Review diff; run core gate; publish patch via Changesets when authorized"
canonicalRoadmap: docs/implementation/ROADMAP.md
activePlan: docs/implementation/active/NEXT-RELEASES.md
pendingManualGate: "Elastic --live credentials; EVIDENCE_GATE not approved; external Promptfoo reproduction kit ready after publish"
worktreeIgnoreOnly:
  - .redstamp/
  - redstamp-proposal-issue-body.md
```

## Published baseline

**6.31.7** on npm (Trusted Publish) — timeline cycle-safe + export/OTLP train (#459/#460).

## Verification claim levels (do not collapse)

| Level | Meaning |
| --- | --- |
| code present | Recipe/source exists in repo |
| consumer tested | Published-package or packed local consumer probe |
| Collector observed | Independent Collector file readback (not export fallback) |
| destination observed | Exact-trace indexed readback from a real backend |
| externally reproduced | Third-party engineer ran the reviewer kit |
| upstream accepted | Upstream docs/example PR merged |

## Sequenced status

| Item | Status |
| --- | --- |
| 6.31.7 published | **done** |
| Export lifecycle coalescing (schema 0.1) | **implemented** (pending publish) |
| AI SDK starter tool execution + run isolation | **implemented** (pending publish) |
| Adapter modelId/source/duration + trace-scoped parents | **implemented** (pending publish) |
| OTLP producer-profile validation | **implemented** (pending publish) |
| Collector verifier honesty | **implemented** (fixture-self-test vs collector; `--docker` live still host-dependent) |
| Promptfoo real provider/assertion matrix | **implemented** (default runs Promptfoo; use `--offline-only` for matrix-without-CLI) |
| Elastic exact-trace live readback | **code present** — `--live` requires credentials; offline is export-document-sim only |
| P03A/B/C false-pass checks | **blocked** — missing authoritative probe scripts |
| External Promptfoo reviewer kit | **drafted** under `examples/reviewer-kits/promptfoo-trajectory/` |
| #450 FreshCtx | parallel; partner rerun pending |
| V7 | NO-GO |

## Stop marker

```text
LAST_PUBLISHED_RELEASE: 6.31.7
ACTIVE: integration honesty follow-up after 6.31.7
NEXT: maintainer review → Changeset patch publish → external Promptfoo reproduction
V7_DECISION: NO-GO
EVIDENCE_GATE: not approved
ADOPTION_FREEZE: excluded
```
