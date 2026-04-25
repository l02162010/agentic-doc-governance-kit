> Status: canonical
> Role: AI agent task classification, risk-tier gates, skill routing, and completion contract
> Source of truth for: how AI agents turn user requests into product-grade work

# Agent Execution Contract

This document defines how AI agents classify work, choose skills, apply risk-tier gates, and decide when a task is complete.

## North Star

The user should be able to describe the desired product feature in natural language. The agent should then use repo docs, skills, checks, and evidence paths to drive the work from request to product-grade closeout.

## Task Classes

| Task class | Meaning | Primary path |
|---|---|---|
| `idea intake` | Future feature, roadmap item, or memory request | Update `active-backlog.md` or `docs/drafts/`. |
| `formal planning` | Feature needs scope, acceptance criteria, and owner doc | Create/update one `docs/canonical/features/FEAT-xxx-*.md`. |
| `readiness` | Feature may move toward implementation | Use `feature-readiness`. |
| `implementation` | Code/docs/tooling changes are requested | Use owner doc, risk tier, and surface workflow. |
| `verification / closeout` | Evidence, release readiness, shipped status, residual risk | Update feature doc and logs/releases/runbooks as applicable. |
| `doc cleanup` | Move, archive, dedupe, or repair docs | Use typed docs rules and run docs integrity. |
| `release / deploy` | Staging, production, release policy, rollout | Use project release runbooks and release metadata. |
| `bug / QA / review` | Investigate, test, or review behavior/diff | Use relevant runbooks, source, tests, and review rules. |

## Risk Tiers

| Tier | Use when | Required agent gates |
|---|---|---|
| `T1` | AI behavior, auth, sync, legal/privacy, analytics, release, production, account handling, export/import, trust, or data handling changes | Feature owner doc, readiness when non-trivial, side-effect checks, verification evidence, docs integrity, skill integrity when skills/routing changed, closeout evidence or explicit waiver. |
| `T2` | User-facing features, API contracts, data models, parity, settings surfaces, or product behavior without T1 trust boundaries | Feature owner doc for formal features, acceptance criteria, verification path, runtime spec update if behavior becomes contract, docs integrity when docs changed. |
| `T3` | Copy, style, local bugfix, small refactor, comments, tests, docs wording with no product contract or trust/data behavior change | Relevant local check, diff review, docs integrity only if docs changed. No feature doc, readiness review, semantic review, or closeout manifest required. |

If uncertain between tiers, choose the higher tier until the owner doc explains why a lower tier is correct.

## Skill Routing

Use repo-local skills when the request matches them.

| Request | Skill |
|---|---|
| Feature intake, feature doc, backlog, archive, placement, closeout | `feature-lifecycle` |
| Readiness review or `rf FEAT-xxx` | `feature-readiness` |
| Surface implementation | `implementation-surface` or a project-specific implementation skill |

When no repo-local skill exists, use the closest canonical doc/runbook and state the fallback. Do not pretend an unavailable skill was invoked.

## Completion Rules

Code written is not enough.

Before final response, confirm:

- task class and risk tier were applied
- owner doc was updated when required
- runtime/product contract docs were updated when behavior changed
- legal, AI, runbook, release, and analytics side effects were checked where applicable
- required verification ran or a blocker/residual risk was recorded
- docs integrity passed after docs changes
- skill integrity passed after skill/routing changes
- diff was reviewed

For T1/T2 formal features, closeout must be traceable from the feature owner doc. Chat history is not a source of truth.

## Closeout Manifest

When a T1/T2 feature is marked `SHIPPED`, its owner doc must include:

- **Runtime contract**: canonical product/runtime docs updated, not applicable, or waived with reason
- **Verification**: commands, smoke checks, benchmark/eval evidence, or blocker
- **Legal outcome**: legal/data-policy impact, not applicable, or waiver
- **AI outcome**: AI behavior/system-card/eval impact, not applicable, or waiver
- **Runbook outcome**: operational docs updated, not applicable, or waiver
- **Release outcome**: release metadata, release pointer, not applicable, or waiver
- **Semantic review**: passed, waived with reason, or not required by tier/policy
- **Acceptance waivers**: `none`, or exact unchecked acceptance criterion text / criterion ID with waiver reason
- **Residual risks**: explicit remaining risk, none, or follow-up owner

Unchecked acceptance criteria in shipped T1/T2 feature docs are allowed only when:

- the unchecked criterion line ends with `[waived: reason]`
- `Closeout Manifest` includes `Acceptance waivers` with the exact unchecked criterion text or criterion ID and a reason

## Stop Conditions

Stop and ask the user for a decision when:

- product intent or acceptance criteria conflict
- credentials, billing, production approval, or external access are required
- public legal commitments or privacy promises would change
- a destructive operation is needed
- requested work would bypass canonical release policy

If a stop condition is hit, record the blocker in the owner doc when the task is a formal feature.
