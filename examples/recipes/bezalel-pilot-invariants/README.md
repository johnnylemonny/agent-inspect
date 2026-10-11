# Recipe: bezalel-pilot-invariants (Joseph / F09B)

Custom map of the recovered Bezalel pilot `trajectory.json` (nine-event ordinal
summary) onto ten invariants. Foreign semantic-summary schema — **not** native
AgentInspect JSONL. No fabricated timestamps. No Bezalel adapter package.

## Run

```bash
pnpm --filter agent-inspect-recipe-bezalel-pilot-invariants start
```

## Support classes

| Class | Meaning |
| --- | --- |
| custom | Evaluated by this recipe’s invariant checks |
| native-unsupported | Timing / JSONL import gap (documented) |
| lossy | Mapping ledger loss retained |

Mutation controls intentionally fail selected invariants.
