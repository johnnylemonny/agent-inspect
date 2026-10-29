# Recipe: nestjs-tenant-incident (Uduak / W14)

Real NestJS `TestingModule` bootstrap (not a Nest-shaped mock). Keyless stubbed
policy retrieval + answer. One supported causal claim: the answer must consume
the policy result for the **requested** tenant.

Captured identifiers use recipe-scoped **opaque** operation / tenant / result
refs (`op-ref-*`, `tref-alpha`, `tref-beta`, `rref-*`). Do not encode a tenant
name, user, URL, or filesystem path inside an allowed identifier. Under
`share`/`strict`, `[REDACTED] == [REDACTED]` is classified **unknown**, not a
join match. `SAFE` is not a general privacy certificate.

| Variant | Expectation |
| --- | --- |
| good (opaque alpha → policy alpha) | contract pass + join match |
| broken (alpha request binds beta policy) | join fail |
| privacy surfaces (local/share/strict) | no legacy tenant tokens; cases distinguishable or unknown |

Synthetic opaque refs only. No private partner data.

## Exact command

```bash
AGENT_INSPECT_SILENT=true pnpm --filter agent-inspect-recipe-nestjs-tenant-incident start
```

## Narrow handback

- Supported: requested-tenant policy join on the Nest path (good vs wrong-bind) via opaque refs.
- Not claimed: production Nest multi-tenancy, partner data, or general causal root-cause.
- Evidence: recipe stdout matrix + `.agent-inspect-runs/` traces from the command above.
