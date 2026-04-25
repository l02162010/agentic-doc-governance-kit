# Agentic Doc Governance Kit

A reusable documentation governance framework for AI-agent-managed software projects.

The goal is simple: a user should be able to describe a desired product feature in natural language, and an AI agent should have enough repo-local structure to classify the work, choose the right workflow, implement safely, verify the result, and close it out without relying on chat history as the source of truth.

## What This Provides

- Typed documentation layout for canonical docs, runbooks, logs, drafts, and releases.
- Feature lifecycle documents with risk tier, gates, verification, and closeout evidence.
- Agent execution contract for task classification, skill routing, stop conditions, and completion rules.
- Deterministic checkers for docs integrity, skill registry drift, and feature closeout.
- Repo-local skill templates for lifecycle, readiness, and implementation workflows.
- A CLI that can initialize the framework in another repo.

## Quick Start

From this repo or an installed package:

```bash
node bin/agentic-doc-governance.mjs init /path/to/your-project
# or, after publishing:
npx agentic-doc-governance init /path/to/your-project
```

Then in the target project:

```bash
node scripts/docs-integrity-check.mjs --check-generated
node scripts/skills-integrity-check.mjs
node scripts/agent-closeout-check.mjs --feature FEAT-001
```

Or run this toolkit's own checks:

```bash
npm test
```

## CLI

```bash
agentic-doc-governance init <target-dir> [--force]
agentic-doc-governance init <target-dir> [--dry-run]
agentic-doc-governance feature add FEAT-xxx <name> [--root <dir>] [--status IDEA] [--risk T2] [--priority P2] [--summary <text>] [--dry-run]
agentic-doc-governance docs-check [--root <dir>] [--check-generated] [--json]
agentic-doc-governance skills-check [--root <dir>] [--json]
agentic-doc-governance closeout-check --feature FEAT-xxx [--root <dir>] [--json]
agentic-doc-governance --version
```

`init` preflights every file it would write. Without `--force`, it refuses to overwrite existing files before copying anything.

`feature add` creates one feature owner doc and appends one backlog row using the configured `closeout.featureRoot` and `closeout.backlogPath`. It refuses duplicate feature IDs.

## Intended Repo Shape

```text
your-project/
  .agentic-doc-governance.json
  AGENTS.md
  docs/
    README.md
    canonical/
      documentation-governance.md
      feature-lifecycle-governance.md
      agent-execution-contract.md
      active-backlog.md
      features/
        feature-template.md
    runbooks/
      docs-integrity-check.md
  .codex/
    skills/
      README.md
      feature-lifecycle/SKILL.md
      feature-readiness/SKILL.md
      implementation-surface/SKILL.md
  scripts/
    docs-integrity-check.mjs
    skills-integrity-check.mjs
    agent-closeout-check.mjs
```

## Configuration

The generated `.agentic-doc-governance.json` keeps the default zero-config behavior explicit:

- `docs.roots`: markdown roots scanned by docs integrity checks.
- `skills.roots`: repo-local skill registries scanned by skill integrity checks.
- `generated.requiredPaths`: files that must exist when `--check-generated` is used.
- `closeout`: optional paths and required metadata/manifest fields for feature closeout.

Product repos can edit this file when they intentionally adapt the footprint. The default install checks only the generated `docs/`, `.codex/skills/`, and `scripts/` layout.

## Core Contract

The framework splits work into three risk tiers:

- `T1`: trust, data, auth, AI behavior, release, production, legal, analytics, account handling.
- `T2`: user-facing features, API contracts, data models, cross-surface parity, product behavior.
- `T3`: copy, style, tests, comments, small refactors, and local fixes with no product or trust impact.

T1/T2 shipped features require a closeout manifest. T3 changes stay lightweight.

## Adaptation Model

This repo is the generic core. Each product repo should add its own adapter:

- domain-specific AGENTS rules
- surface-specific skills
- product/runtime specs
- deployment runbooks
- legal or AI policy docs when applicable
- checker configuration if the default rules are too broad or too narrow

Do not put project secrets, credentials, private data, or product-specific absolute paths into the generic kit.

## Development

```bash
npm test
npm pack --dry-run
```

`npm test` runs the Node test suite, docs integrity, skills integrity, closeout self-tests, and the example product closeout check. CI runs the same command on every pull request.

Before publishing, update `CHANGELOG.md` and follow `RELEASE.md`.
