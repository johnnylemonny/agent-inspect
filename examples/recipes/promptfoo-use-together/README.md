# Recipe: promptfoo-use-together

Executable local matrix: same final answer, correct vs wrong tool path.

| Case | Answer assert | Trajectory assert |
| --- | --- | --- |
| Correct (`lookup_orders`) | pass | pass |
| Wrong (`delete_orders`) | pass | fail |
| Missing / incomplete / unrelated | — | never pass |

Runs select traces by **exact run name** (never newest).

```bash
pnpm build
cd examples/recipes/promptfoo-use-together
pnpm install
pnpm verify
# optional live Promptfoo (example-local pin only — not root/core):
pnpm promptfoo
```

Files: `provider.mjs`, `assert-trajectory.mjs`, `promptfooconfig.yaml`, `verify.mjs`.

`PROMPTFOO_DISABLE_REMOTE_GENERATION=true` is required. No Promptfoo/OTel deps in root or core.
