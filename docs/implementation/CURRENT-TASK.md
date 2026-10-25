# Current task

```yaml
executionMode: maintainer-reviewed
namedTrain: stability-after-63111
currentTrain: stability-after-63111
trainStatus: "6.31.24 pending publish (MCP tool descriptions); 6.32 blocked"
currentChunk: "post-6.31.23 descriptions — Version Packages → publish; then D1"
nextAction: "Merge Version Packages for 6.31.24; hold Indu/Swapnil/João/#494/#98/email; no 6.32 without EVIDENCE_GATE"
canonicalRoadmap: docs/implementation/ROADMAP.md
activePlan: docs/implementation/active/NEXT-RELEASES.md
pendingManualGate: "EVIDENCE_GATE not approved — blocks 6.32.0; C10 Elastic --live; Collector Docker"
worktreeIgnoreOnly:
  - .redstamp/
  - redstamp-proposal-issue-body.md
  - .tmp-plumbline/
  - tmp/
```

## Published baseline

**6.31.23** — all 18 packages on npm (Trusted Publish [38810913852](https://github.com/rajudandigam/agent-inspect/actions/runs/38810913852); Version Packages [#503](https://github.com/rajudandigam/agent-inspect/pull/503); code `297b1f11`).

## Shipped in 6.31.23 (Prompt A residuals / #484)

| Chunk | Status | Proof |
| --- | --- | --- |
| Compare full identity before OTLP bound + truncated-collision `identity_conflict.fields` | **published** | AR01–AR03; f04 |
| Converter `delivery_event_base` provenance; strip only with stamp | **published** | AR04–AR06; O05 retained |
| Manual holds | **held** | Indu v3; Swapnil #437; João; Mikhail #494; plumbline #98; email |

## Pending 6.31.24 (MCP tool descriptions)

| Chunk | Status | Proof |
| --- | --- | --- |
| `runId` description; `find_slowest_path` legacy-alias description | **code landed** | mcp-server `tools.ts`; scanner 23 tools, 99% A |

## Honesty

Full #484 issue closure still needs remaining W04 partner-packet acceptance beyond this matrix. After 6.31.24 publish: next code chunk D1. No email / no 6.32.

## Stop marker

```text
LAST_PUBLISHED_RELEASE: 6.31.23
PENDING_PUBLISH: 6.31.24
ACTIVE: Version Packages → Trusted Publish; then D1
NEXT: D1 MCP isError evidence; no 6.32 without EVIDENCE_GATE
V7_DECISION: NO-GO
EVIDENCE_GATE: not approved
ADOPTION_FREEZE: excluded
```
