---
name: feature-readiness
description: Use when deciding whether a planned feature can move into implementation, including blocker analysis and artifact decisions.
---

# Feature Readiness

Use this skill before implementing formal T1/T2 features or when the user asks whether a feature is ready.

## Scope

- Validate problem, goal, non-goals, and user-facing behavior
- Check scope boundaries and acceptance criteria
- Identify legal, AI, runbook, release, analytics, and data side effects
- Decide whether readiness blocks implementation
- Produce an implementation handoff

## Default workflow

1. Read `AGENTS.md`, `agent-execution-contract.md`, and the feature owner doc.
2. Confirm risk tier and task class.
3. Review acceptance criteria for testability.
4. Check side-effect triggers.
5. Decide `Ready for IN_PROGRESS`, `Blocked`, or `Needs planning`.
6. Record the verdict in the feature owner doc.

## Output format

Report:

- readiness verdict
- blockers
- required artifacts
- implementation handoff
- verification path
