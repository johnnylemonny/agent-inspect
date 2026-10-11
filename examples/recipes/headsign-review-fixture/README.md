# Recipe: headsign-review-fixture (meganemura / W13 / F10A)

Docs-only / synthetic review fixture for [meganemura/headsign](https://github.com/meganemura/headsign).

**Pin:** `headsign-cli-contract-2024-docs` — historical docs-era `headsign next`
first-line tokens and `headsign status` exit rules. Not a current CLI integration.

| Surface | Contract |
| --- | --- |
| `next` ADVANCE\|COMPLETE | exit 0 (ADVANCE ≠ COMPLETE; both success exits) |
| `next` RETRY\|PENDING | exit 1 |
| `next` ESCALATE\|ABORT | exit 2 |
| `status` | exit 0 when readable; exit 3 when unreadable |

Transcripts are **labeled synthetic** — not produced by an actual CLI run.
This recipe never executes commands copied from a record.

## Run

```bash
pnpm --filter agent-inspect-recipe-headsign-review-fixture start
```
