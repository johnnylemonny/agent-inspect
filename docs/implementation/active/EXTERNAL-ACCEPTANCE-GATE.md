# 6.32.0 external acceptance gate

**Train:** `stability-after-63111` → conditional `6.32.0`
**Worksheet date:** 2026-09-28 (retargeted from obsolete 6.18.0 gate text)
**Rule:** Do not open a Changeset for `6.32.0` unless this gate is satisfied. Stability patches (`6.31.16+`) may ship without this gate.

**Status:** **not approved** (`EVIDENCE_GATE: not approved`)

## Required evidence (must be real; do not fabricate)

| Gate | Status | Notes |
|------|--------|-------|
| External / partner acceptance against published baseline (≥ 6.31.15) | **Missing** | No retained partner attestation worksheet under `docs/adoption-evidence/` for a post-6.31 rerun |
| Compatibility/provenance check across the 18-package fixed group | Present in CI (`linked-versions`, pack smoke, Trusted Publishing) | Does not substitute for external acceptance |
| Public copy remains free of soft-launch / waiting language | Present | Enforced by `repo:health` |
| Offline verifier false-greens from 6.31.15 closure audit closed (C01, C07–C09, C11) | **In progress** | Required before treating destination integrations as acceptance-ready; still not a substitute for partner attestation |

## Decision

**Stop before any 6.32.0 Changeset.** Continue `6.31.x` reopen patches on `main`. Keep packages at the latest published `6.31.x` until an external acceptance worksheet exists.

## What would unblock 6.32.0 publication

A public-safe worksheet under `docs/adoption-evidence/` with:

- anonymous-or-named partner class (NestJS/LangGraph or equivalent);
- AgentInspect version under test (≥ current published `6.31.x`);
- pass/fail for trajectory gate + Evidence verify;
- redacted artifact paths (no private traces committed).

Historical note: an earlier worksheet titled `6.18.0` instructed maintainers to remain on `6.17.1`. That instruction is obsolete; do not use it for current release decisions.
