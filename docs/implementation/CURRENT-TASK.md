# Current task

```yaml
executionMode: maintainer-reviewed
namedTrain: stability-after-63111
currentTrain: stability-after-63111
trainStatus: "6.31.24 published; partner holds; 6.32 blocked"
currentChunk: "post-6.31.24 — next prompt D1; holds"
nextAction: "D1 MCP isError evidence; hold Indu/Swapnil/João/#494/#98/email; no 6.32 without EVIDENCE_GATE"
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

**6.31.24** — all 18 packages on npm (Trusted Publish [40165917348](https://github.com/rajudandigam/agent-inspect/actions/runs/40165917348); Version Packages [#508](https://github.com/rajudandigam/agent-inspect/pull/508); code `9058e646`).

## Shipped in 6.31.23 (Prompt A residuals / #484)

| Chunk | Status | Proof |
| --- | --- | --- |
| Compare full identity before OTLP bound + truncated-collision `identity_conflict.fields` | **published** | AR01–AR03; f04 |
| Converter `delivery_event_base` provenance; strip only with stamp | **published** | AR04–AR06; O05 retained |
| Manual holds | **held** | Indu v3; Swapnil #437; João; Mikhail #494; plumbline #98; email |

## Shipped in 6.31.24 (MCP tool descriptions)

| Chunk | Status | Proof |
| --- | --- | --- |
| `runId` description; `find_slowest_path` legacy-alias description | **published** | mcp-server `tools.ts`; scanner 23 tools, 99% A |

## Honesty

Full #484 issue closure still needs remaining W04 partner-packet acceptance beyond this matrix. Next code chunk: D1. No email / no 6.32.

## Stop marker

```text
LAST_PUBLISHED_RELEASE: 6.31.24
ACTIVE: next D1; partner holds
NEXT: D1 MCP isError evidence; no 6.32 without EVIDENCE_GATE
V7_DECISION: NO-GO
EVIDENCE_GATE: not approved
ADOPTION_FREEZE: excluded
```
