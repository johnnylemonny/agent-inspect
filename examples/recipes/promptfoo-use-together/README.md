# Recipe: promptfoo-use-together

Executable local matrix: same final answer, correct vs wrong tool path.

| Case (`vars.caseId`) | Answer assert | Trajectory assert | Outer |
| --- | --- | --- | --- |
| `correct-tool` | pass | pass | pass |
| `wrong-tool` | pass | fail (tool contract) | fail |
| `missing-metadata` | — | must fail | fail |
| Answer fail + trajectory pass | — | — | **outer fail** |

Runs select traces by **exact run name** (never newest). Default `pnpm verify` runs Promptfoo **0.118.17** into a **fresh per-invocation directory** and interprets the matrix by stable `caseId` (not row position). Stale JSON after unexpected child exits is never accepted.

```bash
pnpm build
cd examples/recipes/promptfoo-use-together
pnpm install
pnpm test:matrix          # synthetic interpreter controls
pnpm verify:offline       # AgentInspect-only trajectory matrix
pnpm verify               # includes Promptfoo CLI (pinned local binary when installed)
```

Provider is a constructible class (`id` + `callApi`) for Promptfoo's `file://` loader. Assertion signature is `(output, context)` and returns the **real** trajectory grade.

`PROMPTFOO_DISABLE_REMOTE_GENERATION=true` is required. No Promptfoo/OTel deps in root or core.

## Pins

- `promptfoo@0.118.17`
- `agent-inspect` workspace / published **6.31.11+**
- Node `>=20` (kit intent: Node 22.x)

## Limitations

- Synthetic `test:matrix` controls are not live Promptfoo evidence.
- Actual CLI eval may still hit remote-generation / upstream network controls; mark that path pending when blocked—do not stub it as offline success.
- Does not prove Elastic/Collector destination ingestion.
