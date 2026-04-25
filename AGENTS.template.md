# AGENTS.md

This file gives AI agents repo-local instructions for working in this project.

## Reading Order

When project context is needed, read in this order:

1. `docs/README.md`
2. `docs/canonical/agent-execution-contract.md`
3. `docs/canonical/documentation-governance.md`
4. `docs/canonical/feature-lifecycle-governance.md`
5. `docs/canonical/active-backlog.md`
6. The relevant `docs/canonical/features/FEAT-xxx-*.md`
7. The relevant runbook if the task is operational

## Documentation Governance

Treat documentation as typed artifacts:

- `docs/canonical/`: current source of truth
- `docs/canonical/features/`: one owner doc per formal feature
- `docs/runbooks/`: repeatable operational workflows
- `docs/logs/`: dated evidence, audits, and execution notes
- `docs/releases/`: release pointers and immutable release metadata
- `docs/drafts/`: uncommitted ideas
- `docs/archive/`: superseded or historical docs

Do not create new root-level planning files unless the user explicitly asks.

## Agent Execution

Use `docs/canonical/agent-execution-contract.md` to classify task type, risk tier, required gates, stop conditions, and closeout requirements.

Default routing:

- Feature intake, backlog, feature docs, closeout, archive, placement: use `feature-lifecycle`
- Readiness review or pre-implementation gate: use `feature-readiness`
- Surface implementation: use `implementation-surface` or a project-specific implementation skill

Fallback routing:

- If no repo-local skill exists, use the nearest canonical doc or runbook and state the fallback.
- Do not pretend an unavailable skill was invoked.

## Required Checks

After docs, skill, routing, or governance changes, run:

```bash
node scripts/docs-integrity-check.mjs --check-generated
node scripts/skills-integrity-check.mjs
```

For T1/T2 formal feature closeout, run:

```bash
node scripts/agent-closeout-check.mjs --feature FEAT-xxx
```

Always review the diff before finishing.
