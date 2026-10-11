# Recipe: valid-variable-paths (Shola #491 + Anitesh)

One TraceContract accepting legitimate variation: required lookup, forbidden refund,
lookup-before-answer, retry ceiling ≤2, and explicit successful-result dependency
(`requireExplicitReference` via matching `toolCallId`).

| ID | Expected |
| --- | --- |
| V01–V02 | pass (optional format allowed) |
| V03–V05 | fail (refund / missing / future) |
| V06-retry-ok | pass (failed-then-success allowlisted) |
| V06-retry-excess | fail |
| V07 wrong / V08 missing result ref | fail `successful-result-dependency` |
| anitesh-seven-safe | pass — **7 logical** events, valid lifecycle pairs |
| anitesh-seven-broken | fail (forbidden refund) |

## Run

```bash
AGENT_INSPECT_SILENT=true pnpm --filter agent-inspect-recipe-valid-variable-paths start
```
