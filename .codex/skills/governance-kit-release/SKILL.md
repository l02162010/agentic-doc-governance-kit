---
name: governance-kit-release
description: Use when preparing, validating, or packaging an Agentic Doc Governance Kit release, including changelog updates, package version bumps, target-repo smoke tests, release checks, npm pack dry-runs, and release commit readiness. Use this whenever the user says to prepare a release, bump a version, run release checks, or package the kit.
---

# Governance Kit Release

Use this skill to prepare a kit release without skipping the repo-specific gates that keep generated templates, package metadata, and installed-project behavior aligned.

## Scope

- Update `CHANGELOG.md` for the release
- Bump `package.json` and `package-lock.json` versions
- Run a target repo install smoke test
- Run `npm run release-check`
- Confirm `npm pack --dry-run` includes the expected generated files
- Report release readiness and remaining blockers

This skill prepares a release. It does not publish to npm unless the user explicitly asks for publishing.

## Default workflow

1. Inspect the current version:

```bash
node -p "require('./package.json').version"
```

2. Decide the next version from the change type. Use patch for docs, templates, checks, and small CLI fixes unless the user requests another version.
3. Update `CHANGELOG.md`: replace `Unreleased - None` with a dated release section, or add bullets under `Unreleased` if the release version is not yet final.
4. Bump the package version without creating a git tag:

```bash
npm version <next-version> --no-git-tag-version
```

5. Smoke test installation into a temporary target repo:

```bash
tmpdir=$(mktemp -d /tmp/adgk-release-smoke.XXXXXX)
node bin/agentic-doc-governance.mjs init "$tmpdir" --dry-run
node bin/agentic-doc-governance.mjs init "$tmpdir"
node "$tmpdir/scripts/docs-integrity-check.mjs" --root "$tmpdir" --check-generated
node "$tmpdir/scripts/skills-integrity-check.mjs" --root "$tmpdir"
```

6. If a new generated file or skill was added, verify it appears in the dry-run output, installed target repo, and `npm pack --dry-run` contents.
7. Run the release gate:

```bash
npm run release-check
```

8. Review the diff and confirm only release-related files changed.
9. If the user asks for a commit, stage only the release files and commit with a release-focused message.

## Output format

Report:

- target release version
- changelog status
- package files updated
- target repo smoke result
- release-check result
- pack dry-run result
- files changed
- blockers or residual risks
