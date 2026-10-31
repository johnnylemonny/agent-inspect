# Email follow-ups — drafts only (2026-10-30)

**Status:** Not sent. Maintainer must explicitly authorize any Gmail send.

## Jan / John — native Windows rerun (after N1)

**Context:** N1 assertions are now in `scripts/packed-mcp-sdk-e2e.mjs` (`wrapped.ping()`, zero `outside inspectRun` warnings, saved `mcp:tools/list` + `mcpServerName` under the M01/M02 `runId`). Windows matrix in [PR-494-PACKED-MCP-SDK-HARNESS-RECONCILE.md](./PR-494-PACKED-MCP-SDK-HARNESS-RECONCILE.md) stays **PENDING / NOT RUN**.

**Proposed ask (do not invent PASS):**

```text
Subject: AgentInspect packed MCP SDK — Windows rerun after harness N1

Hi Jan,

Thanks again for the packed real-SDK coverage and the Windows offer.

We carried your three checks into the canonical harness on main:
  scripts/packed-mcp-sdk-e2e.mjs
  - await wrapped.ping()
  - zero "outside inspectRun" warnings for the intended run
  - saved JSONL asserts mcp:tools/list + mcpServerName under that runId

When you have a moment, could you rerun on native Windows with mutually agreed pins and reply with Node/npm/pnpm/package versions + exit status?

  pnpm run build && node scripts/packed-mcp-sdk-e2e.mjs

We will not mark the Windows matrix PASS until your measured result lands.

Thanks,
Raju
```

## Faham — hold existing unsent draft

**Gmail draft already prepared:** pins **agent-inspect@6.31.28** and `node prove-same-output-wrong-path.mjs`.  
**Action:** keep unsent until maintainer asks to send. No independent result yet.

## Hashim — one small runnable example

**Goal:** interest follow-up only; ask for one concrete friction point.

```text
Subject: AgentInspect — tiny TypeScript starter + one friction ask

Hi Hashim,

Thanks for the interest. If useful, here is a minimal local loop (Node >=20):

  npm i agent-inspect@6.31.30
  # then in a .mjs / .ts file:

  import { inspectRun, step } from "agent-inspect";

  await inspectRun("hashim-starter", async () => {
    await step("tool:echo", async () => ({ ok: true }), { type: "tool" });
  }, { traceDir: ".agent-inspect-runs" });

  # inspect the JSONL under .agent-inspect-runs/

If you try it, what is the single most annoying friction point
(install, types, docs, or the first trace)? Even one sentence helps.

Thanks,
Raju
```

## Roy / Uduak / Robb

- Roy: GitHub-link resend confirmed; N2 synthetic UNPROVABLE cases added under `docs/evidence/roy-437-unprovable-2026-10-30/`; `-003` acceptance still pending.
- Uduak / Robb: replacement Sent; receipt unconfirmed — no chase unless asked.
