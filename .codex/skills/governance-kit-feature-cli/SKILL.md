---
name: governance-kit-feature-cli
description: Use when modifying, reviewing, or testing Agentic Doc Governance Kit feature lifecycle CLI behavior, especially `feature add`, `feature status`, backlog updates, owner docs, dry-run JSON, validation, rollback, closeout enforcement, and checker integration. Use this whenever the user asks to change feature commands or feature lifecycle automation in this kit.
---

# Governance Kit Feature CLI

Use this skill when changing the feature lifecycle CLI so command behavior, generated docs, and checker expectations stay aligned.

## Scope

- Modify or review `bin/agentic-doc-governance.mjs`
- Modify or review `scripts/lib/cli-feature.mjs`
- Modify or review feature lifecycle helpers and tests
- Maintain backlog and owner-doc synchronization
- Preserve dry-run, JSON, validation, and rollback behavior
- Keep docs and README command examples accurate
- Run focused and full verification

This skill is for the kit's feature lifecycle CLI, not for implementing product features inside a target repo.

## Default workflow

1. Inspect the existing command behavior before editing:

```bash
node bin/agentic-doc-governance.mjs --help
node bin/agentic-doc-governance.mjs feature add --help
```

2. Read the implementation and tests:
   - `bin/agentic-doc-governance.mjs`
   - `scripts/lib/cli-feature.mjs`
   - `scripts/lib/feature-lifecycle.mjs`
   - `test/cli-and-checkers.test.mjs`
3. For `feature add` changes, preserve or update tests for:
   - duplicate feature IDs
   - invalid priorities
   - terminal creation statuses
   - unknown repo-local skills
   - escaped pipe characters in backlog cells
   - configured feature root and backlog path
   - rollback when multi-file writes fail
4. For `feature status` changes, preserve or update tests for:
   - owner doc metadata update
   - active backlog row update
   - dry-run JSON without writes
   - closeout validation for `SHIPPED`
   - notes appended to status history
5. For argument parsing changes, preserve strict unknown-option and missing-value failures.
6. Update README CLI usage and AI Agent User Guide examples when command syntax changes.
7. Run focused checks first:

```bash
node --test test/cli-and-checkers.test.mjs
node scripts/docs-integrity-check.mjs --check-generated
node scripts/skills-integrity-check.mjs
```

8. Run the full suite:

```bash
npm test
```

9. If package behavior or installed-target behavior changed, run a target repo smoke test and `npm run release-check`.

## Output format

Report:

- command behavior changed
- files changed
- validations preserved or added
- docs/examples updated
- focused test result
- full test result
- target repo smoke or release-check result, if needed
- residual risks
