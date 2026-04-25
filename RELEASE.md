# Release Checklist

Use this checklist before publishing a new npm package version.

1. Update `CHANGELOG.md`.
2. Run `npm test`.
3. Run `npm pack --dry-run` and inspect the file list.
4. Confirm `package.json` metadata and version are correct.
5. Confirm the generated governance footprint still passes `node scripts/docs-integrity-check.mjs --check-generated`.
6. Publish from a clean worktree.
