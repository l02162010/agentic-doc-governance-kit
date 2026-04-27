---
name: governance-kit-operator
description: Use when installing, refreshing, or operating Agentic Doc Governance Kit in a target repo, including init dry-runs, generated governance files, feature lifecycle CLI usage, checks, and final user reports. Use this whenever the user asks an AI agent to set up this kit, apply it to another project, initialize governance docs, create governed feature work, or explain the operational workflow.
---

# Governance Kit Operator

Use this skill when the AI agent is the direct operator installing or using Agentic Doc Governance Kit for a product repo.

## Scope

- Install this kit into a target repo with `init`
- Inspect write plans before creating or overwriting files
- Refresh an existing install only with explicit overwrite intent
- Read generated repo-local governance docs in the correct order
- Create feature owner docs and active backlog rows with the CLI
- Move feature status through the lifecycle
- Run docs, skills, and closeout checks before replying
- Report task class, risk tier, files changed, verification, side effects, and residual risks

This skill does not replace project-specific implementation skills. After governance setup and feature handoff, use the target repo's implementation skill or closest project runbook for code changes.

## Default workflow

1. Confirm the target repo path and that Node.js is `>=18.17`.
2. If operating from this kit checkout, inspect the install plan:

```bash
node bin/agentic-doc-governance.mjs init /path/to/target-repo --dry-run
```

3. If operating from an installed npm package, inspect the install plan:

```bash
npx agentic-doc-governance-kit init /path/to/target-repo --dry-run
```

4. Review the dry-run output for unexpected files, wrong target paths, or overwrite actions.
5. Install only after the plan is correct:

```bash
node bin/agentic-doc-governance.mjs init /path/to/target-repo
```

or:

```bash
npx agentic-doc-governance-kit init /path/to/target-repo
```

6. If files already exist, do not overwrite them by default. Use `--force --backup` only when the user explicitly wants to refresh an existing install and keep backup copies.
7. Work from inside the target repo after installation:

```bash
cd /path/to/target-repo
```

8. Read the target repo governance docs before planning or editing:
   - `AGENTS.md`
   - `docs/README.md`
   - `docs/canonical/agent-execution-contract.md`
   - `docs/canonical/active-backlog.md`
   - the relevant `docs/canonical/features/FEAT-xxx-*.md`, if one exists
9. Classify the user request with `agent-execution-contract.md`.
10. Choose the risk tier:
    - `T1`: trust, data, auth, AI behavior, legal, analytics, release, production, account handling
    - `T2`: user-facing features, API contracts, data models, parity, settings surfaces, product behavior
    - `T3`: copy, style, tests, comments, small refactors, local fixes with no product or trust impact
11. For a new formal feature, create a feature owner doc and active backlog row. If the package binary is available, run from the target repo:

```bash
npx agentic-doc-governance-kit feature add FEAT-002 "Feature Name" --root . \
  --summary "Short user-facing summary." \
  --risk T2 \
  --priority P1 \
  --owner product
```

If operating from a local kit checkout instead of an installed package, run the kit binary by absolute or known relative path and point `--root` at the target repo:

```bash
node /path/to/agentic-doc-governance-kit/bin/agentic-doc-governance.mjs feature add FEAT-002 "Feature Name" --root /path/to/target-repo \
  --summary "Short user-facing summary." \
  --risk T2 \
  --priority P1 \
  --owner product
```

12. Move feature status with the same CLI path used for `feature add` when lifecycle state changes:

```bash
npx agentic-doc-governance-kit feature status FEAT-002 --root . --to IN_PROGRESS --note "Implementation started."
npx agentic-doc-governance-kit feature status FEAT-002 --root . --to VERIFYING --note "Ready for verification."
```

or:

```bash
node /path/to/agentic-doc-governance-kit/bin/agentic-doc-governance.mjs feature status FEAT-002 --root /path/to/target-repo --to IN_PROGRESS --note "Implementation started."
node /path/to/agentic-doc-governance-kit/bin/agentic-doc-governance.mjs feature status FEAT-002 --root /path/to/target-repo --to VERIFYING --note "Ready for verification."
```

13. Do not mark `T1` or `T2` features as `SHIPPED` until the owner doc records acceptance criteria, verification evidence, side-effect decisions, residual risks, and closeout manifest fields.
14. Run deterministic checks before the final response:

```bash
node scripts/docs-integrity-check.mjs --check-generated
node scripts/skills-integrity-check.mjs
node scripts/agent-closeout-check.mjs --feature FEAT-002
```

Use `agent-closeout-check` for formal `T1` or `T2` closeout. For `T3` work, run the relevant local check and run docs integrity only when docs changed.

## Output format

Report:

- install path or target repo path
- task class and risk tier
- files changed
- feature ID and status, if feature work was created or updated
- verification commands and results
- docs, legal, AI, runbook, release, and runtime-contract side effects or non-applicability
- residual risks, blockers, or explicit waivers

Do not use chat history as the source of truth for feature state. If a decision matters later, record it in the active backlog, feature owner doc, canonical docs, runbooks, logs, or releases.
