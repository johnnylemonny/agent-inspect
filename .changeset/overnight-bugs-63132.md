---
"agent-inspect": patch
---

Break causal ordering timestamp ties by recorded row order (#518 / #517). Detect Stripe `sk_live_`/`rk_live_`/`sk_test_` and Slack `xox…` values in redact, pre-disk free-text, and verify-safe (#520). Set `check --evidence-on` Evidence `assessment.status` from residual verify-safe, not check pass/fail (#519). Unlink starter control traces so prove-same-output-wrong-path is idempotent (#523).
