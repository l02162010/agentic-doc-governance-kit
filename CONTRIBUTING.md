# Contributing

Thanks for helping improve Agentic Doc Governance Kit.

## Development Setup

Use Node.js 18.17 or newer.

```bash
npm install
npm test
```

Before opening a pull request, run:

```bash
npm run release-check
```

## Change Guidelines

- Keep the CLI entrypoint thin; reusable behavior belongs in `scripts/lib/`.
- Add or update tests for checker behavior, CLI behavior, and package smoke paths.
- Keep generated template changes aligned with `.agentic-doc-governance.json`.
- Do not add project secrets, credentials, private data, or product-specific absolute paths.
- Update `CHANGELOG.md` for user-facing behavior, release process, or package contract changes.

## Pull Requests

Include:

- What changed
- Why it changed
- Verification commands and results
- Any release, documentation, or compatibility impact

