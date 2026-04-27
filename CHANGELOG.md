# Changelog

All notable changes to this project are tracked here.

## Unreleased

- Tightened `feature add` validation for terminal statuses, backlog priorities, and repo-local skill names.
- Added backlog duplicate, malformed row, orphan owner-doc, invalid priority, invalid risk tier, and missing primary skill detection.
- Aligned closeout backlog link checks with configured documentation roots.
- Added centralized governance config path validation so configured paths cannot escape the project root.
- Added reference-style Markdown link checking.
- Added a package metadata release gate for public npm publishing.

## 0.1.0

- Initial reusable documentation governance kit.
- Added CLI initialization for project governance files.
- Added `feature add` scaffolding for feature owner docs and backlog rows.
- Added docs integrity, skills integrity, and feature closeout checkers.
- Added strict CLI/checker argument parsing.
- Added feature owner duplicate detection and backlog Primary doc traceability checks.
- Added example product fixture and CI coverage.
