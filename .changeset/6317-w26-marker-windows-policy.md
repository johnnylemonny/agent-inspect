---
"agent-inspect": patch
"@agent-inspect/langchain": patch
"@agent-inspect/tui": patch
"@agent-inspect/ai-sdk": patch
"@agent-inspect/openai-agents": patch
"@agent-inspect/redact": patch
"@agent-inspect/guardrails": patch
"@agent-inspect/circuit": patch
"@agent-inspect/eval": patch
"@agent-inspect/vitest": patch
"@agent-inspect/jest": patch
"@agent-inspect/mcp": patch
"@agent-inspect/viewer": patch
"@agent-inspect/mcp-server": patch
"@agent-inspect/adapter-sdk": patch
"@agent-inspect/harness": patch
"@agent-inspect/index-sqlite": patch
"@agent-inspect/studio": patch
---

Harden sensitive-key complete-marker handling so arbitrary `[REDACTED:…]` / `[HASH:…]` payloads are re-scrubbed (library-emitted markers only), and ship the already-merged Windows `--policy` drive-path fix.
