# Kit Maintenance Skills

| Skill | Purpose |
|---|---|
| `governance-kit-feature-cli` | Modify or review feature lifecycle CLI behavior and tests |
| `governance-kit-release` | Prepare and verify kit releases |
| `governance-kit-review` | Review this kit's templates, skills, docs, CLI, and packaging changes |
| `governance-kit-skill-authoring` | Create and update repo-local skills used to maintain this kit |
| `governance-kit-target-smoke` | Verify init output and generated checks in a target repo |

These skills are for maintaining this kit repository. They are intentionally not installed into target product repos by the init command.

After changing these skills, the template skill registry, or `AGENTS.md` skill routing, run:

```bash
node scripts/skills-integrity-check.mjs
```
