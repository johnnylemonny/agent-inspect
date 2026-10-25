# Current task

```yaml
executionMode: maintainer-reviewed
namedTrain: stability-after-63111
currentTrain: stability-after-63111
trainStatus: "6.31.25 published; next item 02; 6.32 blocked"
currentChunk: "02 MCP isError tool-result fidelity"
nextAction: "Item 02 MCP isError evidence and #494 harness; hold Indu/Swapnil/João/email; no 6.32 without EVIDENCE_GATE"
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

**6.31.25** — all 18 packages on npm (Trusted Publish [40215892935](https://github.com/rajudandigam/agent-inspect/actions/runs/40215892935); Version Packages [#509](https://github.com/rajudandigam/agent-inspect/pull/509); code `67563a29`).

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

## Shipped in 6.31.25 (strict stack redaction)

| Chunk | Status | Proof |
| --- | --- | --- |
| Strict `stack` / `errorStack` / `stackTrace`, including nested copies | **published** | R01–R06; local stacks kept |
| Non-stack residuals such as `operationId` | **unchanged** | item 06; SAFE is not a privacy certificate |

## Honesty

Full #484 issue closure still needs remaining W04 partner-packet acceptance beyond this matrix. Next code chunk: item 02 MCP `isError`. No email / no 6.32.

## Stop marker

```text
LAST_PUBLISHED_RELEASE: 6.31.25
ACTIVE: item 02 MCP isError; partner holds
NEXT: item 02 MCP isError evidence; no 6.32 without EVIDENCE_GATE
V7_DECISION: NO-GO
EVIDENCE_GATE: not approved
ADOPTION_FREEZE: excluded
```
