# Project Docs

This file is the docs entrypoint. If it conflicts with `AGENTS.md` or canonical governance docs, follow those higher-priority instructions.

## Start Here

- Product/runtime truth: [`docs/canonical/product-runtime-spec.md`](canonical/product-runtime-spec.md) if your project has one
- Agent execution contract: [`docs/canonical/agent-execution-contract.md`](canonical/agent-execution-contract.md)
- Documentation governance: [`docs/canonical/documentation-governance.md`](canonical/documentation-governance.md)
- Feature lifecycle governance: [`docs/canonical/feature-lifecycle-governance.md`](canonical/feature-lifecycle-governance.md)
- Active backlog: [`docs/canonical/active-backlog.md`](canonical/active-backlog.md)
- Feature docs: [`docs/canonical/features/`](canonical/features/)
- Operational runbooks: [`docs/runbooks/`](runbooks/)

## Directory Rules

- `docs/canonical/`: current source of truth
- `docs/canonical/features/`: one lifecycle owner doc per formal feature
- `docs/runbooks/`: repeatable build, deploy, debug, verify, and operate instructions
- `docs/logs/`: dated execution evidence and audit trails
- `docs/releases/`: release pointers and metadata
- `docs/drafts/`: uncommitted ideas
- `docs/archive/`: superseded or historical docs

## Local Checks

```bash
node scripts/docs-integrity-check.mjs --check-generated
node scripts/skills-integrity-check.mjs
node scripts/agent-closeout-check.mjs --feature FEAT-001
```

The generated `.agentic-doc-governance.json` defines the docs roots, skill roots, and required generated files for this project.

To scaffold a new feature owner doc and backlog row:

```bash
agentic-doc-governance feature add FEAT-002 "Feature Name"
```

`feature add` starts features in an active planning status only. Move features to `SHIPPED` or `ARCHIVED` by updating the owner doc, backlog row, and closeout evidence together.
