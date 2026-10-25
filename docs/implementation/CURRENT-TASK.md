# Current task

```yaml
executionMode: maintainer-reviewed
namedTrain: stability-after-63111
currentTrain: stability-after-63111
trainStatus: "6.31.26 published; next item 03; 6.32 blocked"
currentChunk: "03 timeout-ledger evidence"
nextAction: "Item 03 timeout-ledger saved verifier; hold Indu/Swapnil/João/email; no 6.32 without EVIDENCE_GATE"
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

**6.31.26** — all 18 packages on npm (Trusted Publish [40219491873](https://github.com/rajudandigam/agent-inspect/actions/runs/40219491873); Version Packages [#510](https://github.com/rajudandigam/agent-inspect/pull/510); code `4dc95886`).

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

## Shipped in 6.31.26 (MCP isError outcome)

| Chunk | Status | Proof |
| --- | --- | --- |
| `isError: true` persisted as a failed outcome; return unchanged | **published** | M01–M06, M08; packed M13 |
| Canonical packed SDK harness; #494 not merged as a second script | **published** | `scripts/packed-mcp-sdk-e2e.mjs` |

## Honesty

Full #484 issue closure still needs remaining W04 partner-packet acceptance beyond this matrix. #494 stays open; its Vercel check is an access decision. Next code chunk: item 03 timeout ledger. No email / no 6.32.

## Stop marker

```text
LAST_PUBLISHED_RELEASE: 6.31.26
ACTIVE: item 03 timeout ledger; partner holds
NEXT: item 03 timeout-ledger evidence; no 6.32 without EVIDENCE_GATE
V7_DECISION: NO-GO
EVIDENCE_GATE: not approved
ADOPTION_FREEZE: excluded
```
