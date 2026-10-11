# Recipe: headsign-review-fixture (meganemura / W13 / F10A)

Docs-only / synthetic review fixture for [meganemura/headsign](https://github.com/meganemura/headsign).

**Pin:** `meganemura/headsign@v0.3.0` /
[`e375f96d1332c59bfa824bdc0bad039d336ba605`](https://github.com/meganemura/headsign/blob/e375f96d1332c59bfa824bdc0bad039d336ba605/README.md#the-contract)
— historical docs-era `headsign next` / `status` contract. Not a current CLI
integration.

| Surface | Contract |
| --- | --- |
| `next` ADVANCE \<phase\> | exit 0 — **continue** (not terminus) |
| `next` COMPLETE | exit 0 — **terminus** |
| `next` RETRY\|PENDING | exit 1 |
| `next` ESCALATE\|ABORT | exit 2 |
| `status` | exit 0 when readable (incl. ESCALATED/ABORTED); exit 3 when unreadable |

ADVANCE and COMPLETE share exit 0 but are distinct tokens. A terminal/final
completion claim after ADVANCE fails. The `status` surface is checked
independently of `next` tokens.

Transcripts are **labeled synthetic** — not produced by an actual CLI run.
This recipe never executes commands copied from a record.

## Run

```bash
pnpm --filter agent-inspect-recipe-headsign-review-fixture start
```
