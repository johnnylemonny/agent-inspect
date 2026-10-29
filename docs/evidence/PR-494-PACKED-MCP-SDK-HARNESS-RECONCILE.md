# PR #494 reconciliation — packed MCP real-SDK harness (chunk 07)

**Date:** 2026-10-29  
**Related:** [#488](https://github.com/rajudandigam/agent-inspect/issues/488), [#494](https://github.com/rajudandigam/agent-inspect/pull/494)  
**Contributor credit:** [@johnnylemonny](https://github.com/johnnylemonny) (Janek) — packed ESM/CJS consumer work and native Windows validation described in the PR body.

## Decision

**Do not merge PR #494.** The repository already carries a **canonical** real-`@modelcontextprotocol/sdk` packed consumer harness on `main`:

- `scripts/packed-mcp-e2e.mjs` — plain-object client, shared `inspectRun` runtime, MCP bundle externalization (no SDK in sandbox).
- `scripts/packed-mcp-sdk-e2e.mjs` — real SDK `Client`/`Server` + `InMemoryTransport`, ESM and CJS sandboxes, classification checks **M01–M14**, plus strict declaration consumers (`sdk-typecheck.mts` / `.cts`).

Both run from `pnpm pack:smoke` after `pnpm run build`. Maintainers should treat **`packed-mcp-sdk-e2e.mjs` as the single real-SDK packed harness**.

## What PR #494 contributed (retained in spirit)

| Contribution | Disposition |
|--------------|-------------|
| Proof that a **packed tarball consumer** can install the real MCP SDK and exercise `wrapMcpClient` on a true `Client` (ESM + CJS) | **Superseded** by `scripts/packed-mcp-sdk-e2e.mjs` on `main` (broader matrix). |
| **`isError: true`** tool results survive wrapping and tracing | **Retained** — shipped in product (**6.31.26**) and encoded in SDK harness **M13-tool-error-persisted**. |
| Trace linkage under active `inspectRun` (`runId`, `mcp:*` steps) | **Retained** in both mock and SDK harnesses. |
| Contributor **native Windows** run | **Evidence intent retained** — rerun against **`node scripts/packed-mcp-sdk-e2e.mjs`** post-reconcile. |
| Mock-client regression | **Retained** in unchanged `scripts/packed-mcp-e2e.mjs` on `main`. |

## Residual real-SDK packed controls (optional follow-up)

Not blockers for closing #494:

1. **After-dispatch `AbortSignal`** — harness has pre-abort (M09) and close-based cancel (M04) only.
2. **`onprogress` callback** — unit mocks only; not end-to-end in packed SDK script.
3. **Parallel `inspectRun` overlap** — M05 overlaps concurrent calls inside a single run only.

## Commands

```bash
pnpm run build
node scripts/packed-mcp-e2e.mjs
node scripts/packed-mcp-sdk-e2e.mjs
pnpm pack:smoke
```

## Windows matrix row (post-reconcile rerun — template)

| Date | OS | Node | Package managers | Packages / SDK | ESM | CJS | Command / result |
|------|----|------|------------------|----------------|-----|-----|------------------|
| `<YYYY-MM-DD>` | Native Windows 11 (NT 10.0.26200, X64) | `v24.19.0` | `pnpm 9.15.0`; `npm 12.0.2` | `agent-inspect@<workspace-version>` + `@modelcontextprotocol/sdk@1.31.0` | **PASS** | **PASS** | `pnpm run build && node scripts/packed-mcp-sdk-e2e.mjs` → **PASS** |

*Chunk 07: harness reconciliation only — no merge of #494; no schema or runtime API change.*
