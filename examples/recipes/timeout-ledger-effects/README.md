# Recipe: timeout-ledger-effects (#492 / Navya)

Keyless in-process fake ledger: the handler is actually invoked. Shows what
committed after a timeout without claiming exactly-once or real financial
effects. Saved traces keep the fault plan, whether that fault was applied,
each attempt's argument fingerprint, the observer window, and the report
claim when a report step actually ran. Verdicts are recomputed from those
files. A correct operation join does not hide an amount change, and an
`ETIMEDOUT` string without an applied-injection record is not treated as an
injection.

Synthetic only. Not Heimdall field invention.

## Run

```bash
pnpm --filter agent-inspect-recipe-timeout-ledger-effects start
```
