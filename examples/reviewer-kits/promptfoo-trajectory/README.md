# Promptfoo trajectory reviewer kit

Standalone reproduction kit for the answer-vs-trajectory matrix.

**Maintainer disclosure:** This kit is maintained by the AgentInspect maintainer to demonstrate local trajectory checks alongside answer assertions. It is not an independent third-party audit.

## Expected matrix

| Scenario | Answer assertion | Trajectory assertion |
| --- | --- | --- |
| Correct tool path | Pass | Pass |
| Wrong tool path, same answer | Pass | Fail |
| Missing metadata | May N/A | Must not pass |

## Install (one command)

```bash
npm install
```

Pin the AgentInspect release that includes the honesty fixes (post-6.31.7 patch). Until that patch is on npm, link a packed tarball from a green local build.

## Verify (one command)

```bash
npm run verify
```

Writes machine-readable `results/matrix-summary.json`.

## Limitations

- Uses keyless mock tools via AgentInspect `inspectRun` / `step.tool` (not a live LLM provider).
- Requires network once to fetch `promptfoo@0.118.17` via `npx` unless cached.
- Does not prove Elastic/Collector destination ingestion.
- Trajectory contract requires `lookup_orders` and forbids `delete_orders`.

## What to report

Environment (Node version, OS), actual `matrix-summary.json`, setup friction, and any limitation or defect you find.
