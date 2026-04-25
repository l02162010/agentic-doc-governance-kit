---
name: feature-lifecycle
description: Use when adding, planning, updating, verifying, closing out, archiving, or relocating a project feature under the repo's documentation governance model.
---

# Feature Lifecycle

Use this skill when a request affects feature planning, backlog placement, owner docs, lifecycle status, closeout, or governance placement.

## Scope

- Add or update `docs/canonical/active-backlog.md`
- Create or update one `docs/canonical/features/FEAT-xxx-*.md`
- Decide whether content belongs in canonical docs, runbooks, logs, drafts, releases, or archive
- Record implementation handoff and closeout
- Check legal, AI, release, runbook, analytics, and runtime-contract side effects

## Default workflow

1. Read `AGENTS.md`.
2. Read `docs/canonical/agent-execution-contract.md`.
3. Classify task class and risk tier.
4. Update `active-backlog.md` only as an index.
5. Create or update one feature owner doc for formal features.
6. If implementation starts, record scope, verification path, and expected implementation skill.
7. If the feature closes out, ensure acceptance, verification, side effects, residual risks, and status alignment.
8. Run deterministic checks and review the diff.

## Output format

Report:

- canonical files updated
- feature status
- risk tier and required gates
- verification result
- side-effect decisions and residual risks
