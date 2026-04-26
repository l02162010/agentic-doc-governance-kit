# Release Checklist

Use this checklist before publishing a new npm package version.

1. Update `CHANGELOG.md`.
2. Run `npm test`.
3. Run `npm pack --dry-run` and inspect the file list.
4. Confirm the tarball includes `.github/workflows/ci.yml`, `test/cli-and-checkers.test.mjs`, and all `scripts/lib/*.mjs` files required by `.agentic-doc-governance.json`.
5. Confirm `package.json` metadata and version are correct.
6. Confirm the generated governance footprint still passes `node scripts/docs-integrity-check.mjs --check-generated`.
7. Publish from a clean worktree.
