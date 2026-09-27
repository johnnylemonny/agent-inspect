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

Fail closed when suite cases declare no effective assertions or unknown selectors, wire eval.requireSuccess and related eval controls into real check rules, and share AsyncLocalStorage across packed CJS root and /advanced entrypoints so guarded wrappers see the active run context.
