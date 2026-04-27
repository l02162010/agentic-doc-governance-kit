---
name: governance-kit-skill-authoring
description: Use when creating, renaming, reviewing, or updating repo-local skills for Agentic Doc Governance Kit, including skill frontmatter, required sections, registry updates, generated footprint entries, README project shape, changelog notes, and skills integrity checks. Use this whenever the user asks to turn a workflow into a skill or add a skill to this kit.
---

# Governance Kit Skill Authoring

Use this skill to add or update kit-provided repo-local skills in a way that will survive initialization, packaging, and integrity checks.

## Scope

- Create or update the correct skill root: `.codex/skills/<skill-name>/SKILL.md` for kit-maintenance skills, or `templates/.codex/skills/<skill-name>/SKILL.md` for skills installed into target repos
- Write triggering frontmatter descriptions
- Keep skill instructions operational and concise
- Update `templates/.codex/skills/README.md`
- Update `.agentic-doc-governance.json` generated required paths
- Update README project shape when generated skills are listed there
- Update changelog when the skill is user-visible
- Run skills and generated-footprint checks

This skill handles skills shipped by this kit. It does not install personal user skills outside the repo.

## Default workflow

1. Choose a narrow skill name with lowercase kebab-case.
2. Write frontmatter:
   - `name`: exact directory name
   - `description`: include both what it does and when to use it
3. Keep the skill body focused on repeatable agent behavior, not long background explanation.
4. Include the standard headings required by this repo's skills checker:
   - `## Scope`
   - `## Default workflow`
   - `## Output format`
5. Prefer command examples that work in both local-checkout and package-installed contexts when the skill will run outside this repo.
6. Add the skill to the matching registry: `.codex/skills/README.md` for kit-maintenance skills, or `templates/.codex/skills/README.md` for shipped target-repo skills.
7. Add the `SKILL.md` path to `.agentic-doc-governance.json` under `generated.requiredPaths`.
8. If the skill is installed into target repos and README shows the generated project tree, add the skill to that tree.
9. Add a changelog entry if the skill changes shipped behavior or user-visible templates.
10. Run:

```bash
node scripts/skills-integrity-check.mjs
node scripts/docs-integrity-check.mjs --check-generated
npm test
```

11. Review the diff for unintended file churn.

## Output format

Report:

- skill name and path
- trigger intent
- files updated
- generated-footprint and registry status
- verification commands and results
- any follow-up test cases or known limitations
