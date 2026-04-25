---
name: implementation-surface
description: Use when implementing or reviewing project-specific application code after feature lifecycle handoff.
---

# Implementation Surface

Use this skill for product code implementation once the feature owner doc, risk tier, and verification path are clear.

## Scope

- Project-specific source code
- Tests and local verification
- Runtime/product contract updates when behavior changes
- Runbook updates when operation changes

Replace or supplement this skill with more specific skills for backend, frontend, mobile, infrastructure, or AI surfaces.

## Default workflow

1. Read `AGENTS.md`, `agent-execution-contract.md`, and the relevant feature owner doc.
2. Inspect existing source patterns before editing.
3. Keep changes scoped to the feature.
4. Update canonical docs if behavior changes.
5. Run focused tests or checks.
6. Record verification and residual risk.

## Output format

Report:

- files changed
- behavior changed
- verification commands and results
- docs/runbook/legal/AI/release side effects or waiver
- residual risks
