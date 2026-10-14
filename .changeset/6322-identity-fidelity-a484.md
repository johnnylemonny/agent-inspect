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

Treat native eventIds as opaque for retry redelivery fingerprints, retain conflicting same-ID evidence through tree/export, and surface direct vs nested identity disagreements on OTLP round-trip so source and OTLP strict retry gates agree (Prompt A / #484).
