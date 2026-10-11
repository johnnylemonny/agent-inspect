# Bezalel × AgentInspect — Bounded Pilot Package

## Naming

**Bezalel** is the formal name of the system. **Aegis** is the project / historical implementation name under which the source trajectory was produced. In this pilot, those names refer to the same development lineage rather than two independent systems. The package uses *Bezalel* as the formal system name and mentions *Aegis* only where historical naming context is useful.

## Purpose

This is a compact, disclosure-safe fixture derived from one real governed Bezalel (historically Aegis) development trajectory.

The goal is not to integrate AgentInspect into Bezalel and not to adapt Bezalel semantics to AgentInspect. The goal is to test how faithfully AgentInspect's **existing reader/transform and TraceFacts surfaces** can represent execution structure, source lineage, remediation causality, verification, human acceptance, authority-before-mutation, bounded consequential mutation, and durability/recovery.

A result showing that the current AgentInspect model cannot faithfully express one of these transitions is a useful result, not a failed pilot.

## Files

- `trajectory.json` — machine-readable neutral fixture with stable fixture-local IDs and explicit relationships.
- `README.md` — intended semantics, invariants, comparison questions, disclosure boundary, and non-claims.

## Disclosure boundary

The fixture is a **semantic summary**, not a raw Bezalel evidence export. It intentionally omits implementation-specific details that are not necessary for the comparison.

It contains no private reasoning, raw prompts, credentials, source code, local paths, original Git IDs, implementation/auditor model names, internal test taxonomy, or policy-learning internals.

## Fixture story

1. **R1 candidate created** — candidate existence creates no acceptance authority.
2. **Independent R1 audit fails (`FAIL_MAJOR`)** — a verification result, not an authority transition.
3. **R2 remediation candidate created** — explicitly linked to the R1 verification failure, while its source parent remains the prior accepted base rather than failed R1.
4. **Independent R2 audit passes** — verification succeeds, but R2 is still not accepted by the audit itself.
5. **Human owner explicitly accepts R2** — this is the source-acceptance authority transition.
6. **A separate preparation agent performs read-only closure preflight** — it prepares the bounded execution but does not perform the consequential mutation.
7. **The human authority triggers the bounded closure once** — the closure runtime performs one authoritative state transition plus one durable retention binding and no unrelated authority mutation.
8. **Durability and fresh recovery pass** — verification of the promoted state, not a new acceptance.
9. **Independent closure audit passes with non-blocking notes** — verifies the closure and creates no second source acceptance.

## Intended semantics

| Concept | Bezalel-side meaning |
|---|---|
| Candidate creation | A source candidate exists. Existence alone does not grant acceptance or canonical authority. |
| Independent audit | Read-only verification. PASS/FAIL is evidence, not source acceptance. |
| Remediation | Explicit causal relationship to a failed verification/candidate. It must not be inferred only from adjacency or ordering. |
| Source parent | Source lineage. It is distinct from remediation causality. R2 remediates R1 while being re-cut from the prior accepted base. |
| Human source acceptance | The authority event that accepts the source candidate in this fixture. |
| Closure preparation | Read-only preflight/preparation. It creates no consequential authority mutation. |
| Bounded closure execution | Human-triggered consequential execution after source acceptance. |
| Durable retention binding | A durability effect attached to the bounded closure; it does not independently constitute source acceptance. |
| Durability/recovery | Verification that the promoted state survives reconstruction. It creates no second acceptance. |
| Closure audit | Independent verification of the closure. It does not create or repeat source acceptance. |

## Invariants AgentInspect should evaluate

1. Candidate existence does not imply acceptance.
2. Independent audit PASS does not imply acceptance.
3. Failed R1 never gains accepted or canonical authority.
4. R2 remediation causality is distinct from R2 source lineage.
5. Verification and human acceptance remain distinct.
6. The read-only preparation agent does not perform the authority-bearing mutation; the human authority triggers it after acceptance.
7. The closure is bounded to one authoritative state transition plus one durable retention binding, with no unrelated authority mutation.
8. Ordering alone does not establish causality.
9. Durability/recovery and closure audit do not create a second source acceptance.
10. This fixture makes no replay-capability claim.

## Requested first-pass AgentInspect procedure

Please use the process you proposed:

1. Map `trajectory.json` through the **existing** AgentInspect reader/transform and TraceFacts surfaces.
2. Do not change Bezalel semantics or invent missing relationships to obtain a clean mapping.
3. Report what the current contracts can prove, what remains ambiguous, and what cannot be faithfully represented.
4. Where a gap exists, note whether it appears related to already-planned AgentInspect work such as causal ordering, alternate valid paths, actor scope, or outcome provenance.
5. Please do not design a new AgentInspect API solely to make this fixture pass.

## Requested comparison matrix

| Area | Question |
|---|---|
| Execution structure | Are candidate, audit, remediation, acceptance, preparation, mutation, durability and closure-audit events kept distinct? |
| Source lineage vs causality | Can R2 remediate R1 while still having the prior accepted base as its source parent? |
| Authority-before-mutation | Can AgentInspect represent explicit human acceptance before the bounded consequential mutation without treating audit PASS as authority? |
| Actor scope | Can it distinguish the read-only preparation agent, human authority, runtime mechanism and independent auditors? |
| Verification vs acceptance | Can verification outcomes remain separate from human source acceptance? |
| Outcome provenance | Can candidate outcome, verification result, acceptance, state mutation and durability result remain distinct? |
| Invariant results | Which supplied invariants are proven, violated, or ambiguous? |
| Evidence packaging | Which stable IDs and explicit relationships survive reader/transform? |
| Replay non-claim | Does the representation avoid implying that this sanitized fixture is sufficient to replay the original execution? |

## Important interpretation rule

**Order is not causality.** `sequence` exists only for deterministic presentation order. A causal claim exists only where an explicit relationship field states it.

If AgentInspect infers a causal edge solely from order, please report that as a mismatch rather than silently accepting the inference.

## What success means

The pilot does not require every row to be PASS. Faithful mapping, explicit ambiguity, or a demonstrated representation gap are all useful outcomes. The purpose is to learn where the current models align and where they do not.

## Explicit non-claims

This package does not claim that AgentInspect is a Bezalel dependency, has Bezalel authority, can accept/reject Bezalel candidates, can perform remediation or canonical mutation, automatically produces Bezalel evaluation input, contains a full evidence bundle, or can replay the original execution.

This is a bounded external comparison intended to be useful to both projects.
