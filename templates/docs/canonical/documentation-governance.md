> Status: canonical
> Role: typed documentation governance policy
> Source of truth for: documentation placement, priority, discoverability, and edit rules

# Documentation Governance

Treat documentation as typed artifacts, not a flat pile of markdown files.

## Priority

For agent execution, `AGENTS.md` is the highest-priority repo instruction file.

For documentation policy, this file is canonical. `docs/README.md` is an entrypoint and summary.

## Document Types

- `docs/canonical/`: current source of truth
- `docs/canonical/features/`: formal feature lifecycle owner docs
- `docs/runbooks/`: repeatable operational procedures
- `docs/logs/`: dated execution evidence, audits, and reviews
- `docs/releases/`: current release pointers and immutable release metadata
- `docs/drafts/`: uncommitted ideas
- `docs/archive/`: superseded or historical docs

## Writing Rules

- Do not create new root-level docs unless explicitly requested.
- Do not create ambiguous names such as `final`, `latest`, `new`, or `v2`.
- Put new docs in the correct typed directory from the start.
- Prefer updating the existing canonical doc over creating an overlapping file.
- If a doc is superseded, archive it rather than leaving parallel active versions.
- When moving docs, update repo-internal links in the same change.
- After changing docs, run `node scripts/docs-integrity-check.mjs --check-generated`.
- After any file change, review the diff before final response.

## Feature Placement

- Feature index rows belong in `docs/canonical/active-backlog.md`.
- Detailed feature scope belongs in one file under `docs/canonical/features/`.
- Runtime/product behavior belongs in the product/runtime spec if the project has one.
- Execution evidence belongs in `docs/logs/`.
- Operational steps belong in `docs/runbooks/`.
