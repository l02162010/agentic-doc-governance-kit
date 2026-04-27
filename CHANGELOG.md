# Changelog

All notable changes to this project are tracked here.

## Unreleased

- None.

## 0.1.1 - 2026-04-27

- Split the CLI entrypoint into smaller `init` and `feature` command modules while preserving the installed package behavior.
- Expanded generated-footprint checks to include the new CLI command modules.
- Improved controlled Markdown link extraction so code examples are ignored and angle-bracket destinations, percent-encoded paths, and balanced parentheses are supported.
- Tightened `feature add` validation for terminal statuses, backlog priorities, and repo-local skill names.
- Added backlog duplicate, malformed row, orphan owner-doc, invalid priority, invalid risk tier, and missing primary skill detection.
- Aligned closeout backlog link checks with configured documentation roots.
- Added centralized governance config path validation so configured paths cannot escape the project root.
- Added reference-style Markdown link checking.
- Added a package metadata release gate for public npm publishing.
- Fixed backlog Primary doc parsing for paths with balanced parentheses.
- Made `feature status --dry-run --to SHIPPED` run the same closeout validation as real writes.
- Added rollback-backed multi-file writes for feature owner doc and backlog updates.
- Aligned the pinned npm package manager with the supported Node 18 runtime range.
- Added a package lockfile for reproducible development installs.
- Added public repository health files: contribution guide, security policy, badges, Dependabot, and issue templates.
- Updated CI workflow actions to current Node 24-compatible major versions.

## 0.1.0

- Initial reusable documentation governance kit.
- Added CLI initialization for project governance files.
- Added `feature add` scaffolding for feature owner docs and backlog rows.
- Added docs integrity, skills integrity, and feature closeout checkers.
- Added strict CLI/checker argument parsing.
- Added feature owner duplicate detection and backlog Primary doc traceability checks.
- Added example product fixture and CI coverage.
