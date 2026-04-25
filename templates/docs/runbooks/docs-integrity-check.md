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

## Core Issue Codes

| Code | Severity | Meaning | Typical repair |
|---|---|---|---|
| `GENERATED_PATH_MISSING` | `error` | `--check-generated` expected a managed governance file that is missing | Restore the file, re-run `agentic-doc-governance init --force` intentionally, or update `.agentic-doc-governance.json` if the footprint changed. |
| `BROKEN_INTERNAL_LINK` | `error` | markdown points to a missing repo-local path | Fix the link or restore the target file. |
| `MALFORMED_INTERNAL_LINK` | `error` | markdown contains an invalid repo-local link target | Use a valid path or percent-encode special characters correctly. |
| `FEAT_BACKLOG_LINK_MISSING` | `error` | feature owner doc is not indexed by `active-backlog.md` | Add one backlog row pointing to the owner doc. |
| `BACKLOG_ROW_MISSING` | `error` | closeout was requested for a feature missing from `active-backlog.md` | Add the backlog row before closeout. |
| `FEAT_STATUS_INVALID` | `error` | feature doc uses a lifecycle status outside `IDEA`, `PLANNED`, `IN_PROGRESS`, `VERIFYING`, `SHIPPED`, `ARCHIVED` | Replace the invalid status with an allowed lifecycle status. |
| `BACKLOG_STATUS_INVALID` | `error` | backlog row uses a lifecycle status outside the allowed vocabulary | Replace the invalid backlog status. |
| `FEAT_STATUS_MISMATCH` | `error` | feature doc and backlog status disagree | Align the stale status. |
| `SHIPPED_ACCEPTANCE_INCOMPLETE` | `error` | shipped feature has unchecked acceptance criteria without an accepted waiver | Complete, unship, add `[waived: reason]`, or list the exact criterion text / ID under `Acceptance waivers`. |
