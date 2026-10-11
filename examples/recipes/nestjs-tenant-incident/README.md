# Recipe: nestjs-tenant-incident (Uduak / W14)

Real NestJS `TestingModule` bootstrap (not a Nest-shaped mock). Keyless stubbed
policy retrieval + answer. One supported causal claim: the answer must consume
the policy result for the **requested** tenant.

| Variant | Expectation |
| --- | --- |
| good (tenant A → policy A) | contract pass |
| broken (tenant A request binds policy B) | contract fail |

Synthetic tenants only. No private Navan data.

## Exact command

```bash
AGENT_INSPECT_SILENT=true pnpm --filter agent-inspect-recipe-nestjs-tenant-incident start
```

## Narrow handback

- Supported: requested-tenant policy join on the Nest path (good vs wrong-bind).
- Not claimed: production Nest multi-tenancy, Navan data, or general causal root-cause.
- Evidence: recipe stdout matrix + `.agent-inspect-runs/` traces from the command above.
