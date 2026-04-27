---
name: governance-kit-target-smoke
description: Use when validating that Agentic Doc Governance Kit initializes correctly into a target repository, including init dry-runs, generated file presence, installed skills, docs checks, skills checks, and optional feature lifecycle CLI smoke tests. Use this whenever the user asks to test install output, verify init behavior, or confirm generated templates work in a target repo.
---

# Governance Kit Target Smoke

Use this skill to verify that the kit works after installation into a clean target repo, not only inside the kit checkout.

## Scope

- Create a temporary target repo or use a user-provided target path
- Run `init --dry-run`
- Run `init`
- Confirm required generated files exist
- Confirm expected repo-local skills are installed
- Run generated docs and skills checks from the target repo
- Optionally smoke test `feature add` and `feature status`
- Report the target path and verification evidence

This skill should not delete user-provided target repos. Temporary directories may be left in `/tmp` for inspection unless the user asks for cleanup.

## Default workflow

1. Choose one target variable. If the user provided a path, assign it to `target`; otherwise create a temporary directory:

```bash
target=/path/to/target-repo
# or:
target=$(mktemp -d /tmp/adgk-init-smoke.XXXXXX)
```

2. Run dry-run from the kit checkout:

```bash
node bin/agentic-doc-governance.mjs init "$target" --dry-run
```

3. Verify the dry-run output lists any newly added generated files or skills.
4. Install into the target:

```bash
node bin/agentic-doc-governance.mjs init "$target"
```

5. Confirm core generated files exist:

```bash
test -f "$target/AGENTS.md"
test -f "$target/.agentic-doc-governance.json"
test -f "$target/docs/canonical/agent-execution-contract.md"
test -f "$target/scripts/docs-integrity-check.mjs"
test -f "$target/scripts/skills-integrity-check.mjs"
```

6. Confirm expected skills exist. Include any skills added in the current change:

```bash
test -f "$target/.codex/skills/governance-kit-operator/SKILL.md"
```

7. Run target repo checks:

```bash
node "$target/scripts/docs-integrity-check.mjs" --root "$target" --check-generated
node "$target/scripts/skills-integrity-check.mjs" --root "$target"
```

8. If the feature CLI changed, smoke test it from the kit checkout against the target:

```bash
node bin/agentic-doc-governance.mjs feature add FEAT-002 "Smoke Feature" --root "$target" --summary "Smoke test feature." --risk T3 --priority P3 --owner engineering
node bin/agentic-doc-governance.mjs feature status FEAT-002 --root "$target" --to IN_PROGRESS --note "Smoke test status update."
node "$target/scripts/docs-integrity-check.mjs" --root "$target" --check-generated
```

9. Record the exact target path and commands run.

## Output format

Report:

- target repo path
- dry-run result
- installed file checks
- installed skill checks
- docs integrity result
- skills integrity result
- feature CLI smoke result, if run
- blockers or residual risks
