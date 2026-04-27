# Release Checklist

Use this checklist before publishing a new npm package version.

1. Update `CHANGELOG.md`.
2. Run `npm test`.
3. Run `npm pack --dry-run` and inspect the file list.
4. Confirm the tarball includes the runtime footprint: `bin/`, `scripts/`, `templates/`, `examples/`, `README.md`, `CHANGELOG.md`, `RELEASE.md`, `LICENSE`, and `.agentic-doc-governance.json`.
5. Confirm the tarball excludes repo-only development files such as `.github/workflows/ci.yml` and `test/cli-and-checkers.test.mjs`.
6. Confirm all `scripts/lib/*.mjs` files needed by the CLI and checkers are included.
7. Confirm `package.json` metadata and version are correct.
8. Confirm the generated governance footprint still passes `node scripts/docs-integrity-check.mjs --check-generated`.
9. Publish from a clean worktree.
