> Status: canonical
> Role: feature lifecycle policy
> Source of truth for: feature states, readiness, implementation handoff, verification, and shipped closeout

# Feature Lifecycle Governance

Formal features move through a single lifecycle owner doc under `docs/canonical/features/`.

## Status Model

- `IDEA`: known possibility, not yet planned
- `PLANNED`: owner doc exists and scope is defined
- `IN_PROGRESS`: implementation started
- `VERIFYING`: implementation exists and evidence is being collected
- `SHIPPED`: accepted, verified, and closed out
- `ARCHIVED`: superseded or no longer active

## Lifecycle Rules

- A formal feature has exactly one owner doc.
- `active-backlog.md` is an index, not a long-form planning document.
- `IN_PROGRESS` requires clear implementation scope, verification path, and expected skill/workflow.
- `SHIPPED` requires acceptance criteria, verification outcome, side-effect decisions, and residual risk notes.
- T1/T2 shipped features require a closeout manifest.
- T3 small changes should not be forced through full feature lifecycle unless the agent intentionally promotes them.

## Closeout Checklist

Before marking a feature `SHIPPED`, confirm:

- backlog and feature doc statuses match
- acceptance criteria are completed or explicitly waived
- verification ran or blockers are documented
- runtime/product contract docs are updated where behavior changed
- legal, AI, runbook, release, and analytics side effects are handled or waived
- residual risks are explicit
- deterministic checks pass
