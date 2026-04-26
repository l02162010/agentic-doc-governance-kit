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
| `FEAT_BACKLOG_DOC_MISSING` | `error` | backlog row has no Primary doc link | Add a Primary doc link to the feature owner doc. |
| `FEAT_BACKLOG_DOC_MISMATCH` | `error` | backlog row points at a different doc than the active feature owner doc | Point the row at the single active owner doc. |
| `FEAT_OWNER_DUPLICATE` | `error` | more than one active owner doc exists for a feature ID | Merge or archive duplicates until exactly one owner doc remains. |
| `FEAT_OWNER_MISSING` | `error` | backlog row cannot be traced to a feature owner doc | Create the owner doc or remove/archive the stale backlog row. |
| `BACKLOG_ROW_DUPLICATE` | `error` | more than one backlog row exists for a feature ID | Keep exactly one active backlog row. |
| `BACKLOG_ROW_MALFORMED` | `error` | backlog row does not preserve the configured table columns | Rewrite the row with `ID`, `Feature`, `Status`, `Priority`, `Summary`, and `Primary doc`. |
| `BACKLOG_ROW_MISSING` | `error` | closeout was requested for a feature missing from `active-backlog.md` | Add the backlog row before closeout. |
| `FEAT_STATUS_INVALID` | `error` | feature doc uses a lifecycle status outside `IDEA`, `PLANNED`, `IN_PROGRESS`, `VERIFYING`, `SHIPPED`, `ARCHIVED` | Replace the invalid status with an allowed lifecycle status. |
| `RISK_TIER_INVALID` | `error` | feature doc uses a risk tier outside the configured vocabulary | Replace the invalid risk tier or update governance config intentionally. |
| `FEAT_SKILL_INVALID` | `error` | feature doc uses a malformed primary skill name | Use a repo-local skill name such as `feature-lifecycle`. |
| `FEAT_SKILL_MISSING` | `error` | feature doc routes work to a skill that is not installed | Add the skill or update the feature metadata to an installed skill. |
| `BACKLOG_STATUS_INVALID` | `error` | backlog row uses a lifecycle status outside the allowed vocabulary | Replace the invalid backlog status. |
| `BACKLOG_PRIORITY_INVALID` | `error` | backlog row uses a priority outside the configured vocabulary | Replace the invalid backlog priority or update governance config intentionally. |
| `FEAT_STATUS_MISMATCH` | `error` | feature doc and backlog status disagree | Align the stale status. |
| `SHIPPED_ACCEPTANCE_INCOMPLETE` | `error` | shipped feature has unchecked acceptance criteria without an accepted waiver | Complete, unship, add `[waived: reason]`, or list the exact criterion text / ID under `Acceptance waivers`. |
