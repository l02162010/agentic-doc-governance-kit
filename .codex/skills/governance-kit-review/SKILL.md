---
name: governance-kit-review
description: Use when reviewing changes to Agentic Doc Governance Kit itself, especially templates, generated footprint config, repo-local skills, README usage examples, CLI commands, checkers, release metadata, or package contents. Use this whenever the user asks to review a governance kit diff, inspect a new skill, or check whether a kit change missed synchronization.
---

# Governance Kit Review

Use this skill for code-review style inspection of this kit's own changes. Prioritize user-visible breakage, broken generated installs, stale registry entries, invalid command examples, and missing tests.

## Scope

- Review template, script, CLI, checker, skill, and documentation changes
- Verify generated files are tracked in `.agentic-doc-governance.json`
- Check repo-local skill registry consistency
- Check README project shape and command examples
- Check local-checkout and npm-package command paths
- Check release packaging risk
- Recommend focused tests or smoke checks

This skill is for review. Do not edit files unless the user asks for fixes.

## Default workflow

1. Inspect the worktree and diff:

```bash
git status --short
git diff --stat
git diff
```

2. For every new managed file under `templates/`, `scripts/`, `bin/`, examples, or public metadata, verify it is listed in `.agentic-doc-governance.json` when generated-footprint checks should require it.
3. For every new or renamed skill, verify:
   - `templates/.codex/skills/<skill>/SKILL.md` exists
   - `templates/.codex/skills/README.md` lists the skill
   - the skill includes `## Scope`, `## Default workflow`, and `## Output format`
   - README's intended repo shape includes the skill if the shape is shown
4. Review command examples from the point of view of an AI agent executing them:
   - local checkout commands should use `node /path/to/kit/bin/agentic-doc-governance.mjs`
   - package commands should use `npx agentic-doc-governance-kit`
   - target repo commands should pass `--root` when the CLI is not installed inside that repo
5. For CLI/checker changes, look for missing tests around invalid arguments, dry-run behavior, JSON output, rollback, path safety, and generated install smoke.
6. For docs/template changes, run or recommend:

```bash
npm test
```

7. If release packaging may be affected, run or recommend:

```bash
npm run release-check
```

## Output format

Report findings first, ordered by severity:

- file and tight line reference
- severity
- bug or regression
- why it matters
- concrete fix

Then report:

- tests reviewed or run
- open questions
- brief change summary
