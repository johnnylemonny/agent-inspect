# Promptfoo trajectory reviewer kit

Standalone reproduction kit for the answer-vs-trajectory matrix.

**Maintainer disclosure:** This kit is maintained by the AgentInspect maintainer to demonstrate local trajectory checks alongside answer assertions. It is not an independent third-party audit.

## Expected matrix

| `caseId` | Answer assertion | Trajectory assertion | Outer |
| --- | --- | --- | --- |
| `correct-tool` | Pass | Pass | Pass |
| `wrong-tool` | Pass | Fail (tool contract) | Fail |
| `missing-metadata` | May N/A | Must not pass | Fail |
| Answer fail + trajectory pass | — | — | Outer **must fail** |

## Pins

- `agent-inspect@6.31.17` (configured pin in `package.json`; matrix summary reports `agentInspectResolved` from the installed package)
- `promptfoo@0.118.17`
- Node `>=20` (verified intent: Node 22.x)
- Lockfile: `package-lock.json` is committed for reproducible standalone installs

## Install

```bash
npm ci
```

## Verify

```bash
npm run test:matrix   # synthetic interpreter controls (no Promptfoo CLI)
npm run verify        # Promptfoo eval into a fresh results/<invocation>/ directory
```

Each verify run writes `results/<invocationId>/promptfoo-results.json` and `matrix-summary.json`. A prior success summary is never treated as current after an infrastructure failure (unexpected exit, spawn error, timeout, malformed JSON).

Shared matrix logic lives in `lib/matrix-interpret.mjs` and must stay byte-identical to `examples/recipes/promptfoo-use-together/lib/matrix-interpret.mjs`.

## Limitations

- Uses keyless mock tools via AgentInspect `inspectRun` / `step.tool` (not a live LLM provider).
- Prefers the locally installed `promptfoo` binary; falls back to `npx promptfoo@0.118.17` only if missing.
- Does not prove Elastic/Collector destination ingestion.
- Actual CLI completion can still be blocked by upstream remote-generation controls; report that honestly.

## What to report

Environment (Node version, OS), invocation id, `matrix-summary.json`, setup friction, and any limitation or defect you find.
