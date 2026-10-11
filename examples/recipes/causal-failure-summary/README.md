# Recipe: causal-failure-summary (Thorin / W16)

Compact usability example over `findFirstCausalFailure` (`agent-inspect/advanced`).
Shows a supported linked failure summary versus adjacent/unlinked candidates.
Does not claim proven ultimate root cause, automatic repair, or a new API.

## Exact command

```bash
AGENT_INSPECT_SILENT=true pnpm --filter agent-inspect-recipe-causal-failure-summary start
```

## Narrow handback

- Supported: first linked failure via existing `findFirstCausalFailure` on synthetic events.
- Not claimed: automatic repair, ultimate root cause, or a new public analysis API.
- Evidence: recipe stdout (`supported` vs `none` classes) from the command above.
