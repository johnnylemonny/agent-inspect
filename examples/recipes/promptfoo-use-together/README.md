# Recipe: promptfoo-use-together

Executable local matrix: same final answer, correct vs wrong tool path.

| Case | Answer assert | Trajectory assert |
| --- | --- | --- |
| Correct (`lookup_orders`) | pass | pass |
| Wrong (`delete_orders`) | pass | fail |
| Missing metadata | — | must fail |

Runs select traces by **exact run name** (never newest). Default `pnpm verify` runs Promptfoo `0.118.17` and checks the per-case matrix.

```bash
pnpm build
cd examples/recipes/promptfoo-use-together
pnpm install
pnpm verify
# offline AgentInspect matrix only (no Promptfoo CLI):
node verify.mjs --offline-only
```

Provider is a constructible class (`id` + `callApi`) for Promptfoo's `file://` loader. Assertion signature is `(output, context)` and returns the **real** trajectory grade.

`PROMPTFOO_DISABLE_REMOTE_GENERATION=true` is required. No Promptfoo/OTel deps in root or core.
