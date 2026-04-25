> Status: `SHIPPED`
> Owner: `engineering`
> Source of truth for: example onboarding checklist behavior
> Depends on: none
> Risk tier: `T2`
> Primary skill: `implementation-surface`
> Required gates: docs integrity, skills integrity, closeout check
> Legal impact: `none`
> AI impact: `none`
> Release impact: `none`
> Verification: `node scripts/agent-closeout-check.mjs --feature FEAT-001`
> Closeout evidence: `Closeout Manifest`
> Indexed by: `docs/canonical/active-backlog.md`

# FEAT-001 - Example Onboarding Checklist

## Problem

New users need a clear first-run checklist.

## Goal

Show a simple checklist after signup.

## Non-goals

No billing, account deletion, or AI behavior.

## User-facing Behavior

Users see three onboarding tasks.

## Scope

- UI copy only for this example

## Workstreams

| ID | Scope slice | Status | Notes |
|---|---|---|---|
| `TODO-001` | Example implementation | `DONE` | fixture only |

## Acceptance Criteria

- [x] Checklist has three tasks.
- [ ] Optional celebratory animation. [waived: not required for initial shipped example]

## Rollout and Verification

- `node scripts/agent-closeout-check.mjs --feature FEAT-001`

## Closeout Manifest

- **Runtime contract**: example only
- **Verification**: closeout checker fixture passes
- **Legal outcome**: none
- **AI outcome**: none
- **Runbook outcome**: none
- **Release outcome**: none
- **Semantic review**: not required
- **Acceptance waivers**: Optional celebratory animation waived because this fixture demonstrates waiver syntax
- **Residual risks**: none
