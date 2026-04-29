# Adoption Checklist

Use this checklist when installing Agentic Doc Governance Kit into a target
repository.

## Pre-install

- [ ] Confirm Node.js runtime is `>=18.17`.
- [ ] Confirm target repo owner approves governance footprint installation.
- [ ] Confirm default branch and PR policy for governance changes.
- [ ] Confirm no conflicting files already exist (or plan `--force --backup`).

## Install

- [ ] Run dry run and inspect file plan:

  ```bash
  npx agentic-doc-governance-kit init /path/to/your-project --dry-run --json
  ```

- [ ] Run actual initialization:

  ```bash
  npx agentic-doc-governance-kit init /path/to/your-project
  ```

## Post-install verification

- [ ] Run docs integrity:

  ```bash
  node scripts/docs-integrity-check.mjs --check-generated
  ```

- [ ] Run skills integrity:

  ```bash
  node scripts/skills-integrity-check.mjs
  ```

- [ ] For active formal features, run closeout check:

  ```bash
  node scripts/agent-closeout-check.mjs --feature FEAT-001
  ```

## Operational setup

- [ ] Assign owners for `.codex/skills/*` workflows.
- [ ] Confirm risk-tier policy (`T1`/`T2`/`T3`) is understood by maintainers.
- [ ] Confirm feature lifecycle fields (status, priority, primary doc) are part
      of review checklists.
- [ ] Confirm release and runbook update expectations.

## Ongoing maintenance

- [ ] Run governance checks in CI (`npm test` or equivalent).
- [ ] Periodically audit `.agentic-doc-governance.json` for path or vocabulary drift.
- [ ] Track major governance decisions in canonical docs instead of chat history.
