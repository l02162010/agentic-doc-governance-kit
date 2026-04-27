# Release Checklist

Use this checklist before publishing a new npm package version.

1. Update `CHANGELOG.md`.
2. Set real public `package.json` URLs for `repository`, `homepage`, and `bugs.url`.
3. Run `npm test`.
4. Run `npm run release-check`.
5. Run `npm pack --dry-run` and inspect the file list.
6. Confirm the tarball includes the runtime footprint: `bin/`, `scripts/`, `templates/`, `examples/`, `README.md`, `CHANGELOG.md`, `RELEASE.md`, `LICENSE`, and `.agentic-doc-governance.json`.
7. Confirm the tarball excludes repo-only development files such as `.github/workflows/ci.yml` and `test/cli-and-checkers.test.mjs`.
8. Confirm all `scripts/lib/*.mjs` files needed by the CLI and checkers are included.
9. Confirm the generated governance footprint still passes `node scripts/docs-integrity-check.mjs --check-generated`.
10. Publish from a clean worktree.
