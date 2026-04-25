> Status: runbook
> Role: local deterministic governance checks

# Docs Integrity Check

Run these commands after docs, skills, routing, checker, or feature closeout changes.

```bash
node scripts/docs-integrity-check.mjs --check-generated
node scripts/skills-integrity-check.mjs
node scripts/agent-closeout-check.mjs --feature FEAT-001
node scripts/agent-closeout-check.mjs --self-test
```

## Rule of Thumb

- `error`: must be fixed before closeout
- `warning`: should be reviewed, may be accepted with reason

Every issue should identify owner doc, observed value, recommended fix, forbidden fix, and confidence.
