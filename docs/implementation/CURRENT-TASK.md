# Current task

```yaml
executionMode: maintainer-reviewed
namedTrain: suite-context-trust-after-6318
currentTrain: suite-context-trust-after-6318
trainStatus: active
currentChunk: "C01+C02 implemented locally; awaiting maintainer review / Changeset"
nextAction: "Maintainer review; then C05 API diagnostics (or Changeset patch when authorized)"
canonicalRoadmap: docs/implementation/ROADMAP.md
activePlan: docs/implementation/active/NEXT-RELEASES.md
pendingManualGate: "Elastic --live credentials; EVIDENCE_GATE not approved; external Promptfoo reproduction; C03–C04 demo journal in proactive-ai-demo; D01 docs package"
worktreeIgnoreOnly:
  - .redstamp/
  - redstamp-proposal-issue-body.md
```

## Published baseline

**6.31.8** on npm (Trusted Publish) — integration honesty train (#462/#463).

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
| 6.31.8 published | **done** |
| Integration honesty | **done** |
| C01 suite assertion integrity | **implemented** (pending review/publish) |
| C02 packed CJS root/advanced context identity | **implemented** (pending review/publish) |
| C05 API misuse diagnostics | **queued** |
| C06 explain logical lifecycle counts | **queued** |
| C07 rule/outcome summary clarity | **queued** |
| C08 direct OpenAI Node recipe | **queued** (after C02 publish) |
| C09 expected semantic-failure suite asserts | **queued** |
| C10 Nest Evidence v2 path | **queued** |
| C11 safety precision | **queued** |
| C12 input provenance extensions | **queued** |
| C13 broader operational consumers | **queued** (split per adapter/app) |
| C03–C04 demo journal / live-profile | demo repo; after C02 candidate tarball |
| D01 docs/examples capture package | separate docs chunk |
| External Promptfoo reviewer kit | drafted under `examples/reviewer-kits/promptfoo-trajectory/` |
| #450 FreshCtx | parallel; partner rerun pending |
| V7 | NO-GO |

## Stop marker

```text
LAST_PUBLISHED_RELEASE: 6.31.8
ACTIVE: suite-context-trust-after-6318
NEXT: maintainer review of C01+C02 → Changeset patch → C05
V7_DECISION: NO-GO
EVIDENCE_GATE: not approved
ADOPTION_FREEZE: excluded
```
