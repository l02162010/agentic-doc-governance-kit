#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parseArgs, UsageError } from "./lib/args.mjs";
import { loadGovernanceConfig } from "./lib/config.mjs";
import { isValidFeatureStatus, normalizeFeatureStatus, validFeatureStatusList } from "./lib/feature-lifecycle.mjs";
import {
  extractSection,
  linkIssueCode,
  makeIssue as buildIssue,
  normalizeLink,
  normalizeRootPath,
  parseMetadata,
} from "./lib/governance-markdown.mjs";
import { parseMarkdownTableRow } from "./lib/markdown-table.mjs";

let options;
try {
  options = parseArgs(process.argv.slice(2), {
    aliases: { h: "help" },
    flags: {
      root: { type: "string" },
      feature: { type: "string" },
      "self-test": { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
} catch (error) {
  if (error instanceof UsageError) {
    console.error(error.message);
    process.exit(error.exitCode);
  }
  throw error;
}
const jsonMode = Boolean(options.flags.json);
const help = Boolean(options.flags.help);
const selfTest = Boolean(options.flags["self-test"]);

if (help) {
  console.log(`Usage: node scripts/agent-closeout-check.mjs --feature FEAT-xxx [--root <dir>] [--self-test] [--json]`);
  process.exit(0);
}

if (options.positionals.length > 0) {
  console.error(`agent-closeout-check does not accept positional arguments: ${options.positionals.join(" ")}`);
  process.exit(2);
}

const root = path.resolve(options.flags.root ?? process.cwd());
const featureArg = options.flags.feature;
let config;
try {
  config = loadGovernanceConfig(root);
} catch (error) {
  console.error(error.message);
  process.exit(error.exitCode ?? 1);
}
const closeoutConfig = config.closeout;

function abs(relPath) {
  return path.join(root, relPath);
}

function exists(relPath) {
  return fs.existsSync(abs(relPath));
}

function readText(relPath) {
  return fs.readFileSync(abs(relPath), "utf8");
}

function walk(dirRel, predicate = () => true) {
  if (!exists(dirRel)) return [];
  const out = [];
  for (const entry of fs.readdirSync(abs(dirRel), { withFileTypes: true })) {
    const entryRel = `${dirRel}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(entryRel, predicate));
    else if (predicate(entryRel)) out.push(entryRel);
  }
  return out.sort();
}

const CLOSEOUT_DOWNGRADE_CONDITION = "Change this rule only through agent-execution-contract or feature-lifecycle governance.";

function addIssue(issues, code, severity, ownerDoc, observed, recommendedFix, forbiddenFix) {
  issues.push(buildIssue({
    code,
    severity,
    ownerDoc,
    observed,
    recommendedFix,
    forbiddenFix,
    downgradeCondition: CLOSEOUT_DOWNGRADE_CONDITION,
  }));
}

function makeIssue(code, severity, ownerDoc, observed, recommendedFix, forbiddenFix) {
  return buildIssue({
    code,
    severity,
    ownerDoc,
    observed,
    recommendedFix,
    forbiddenFix,
    downgradeCondition: CLOSEOUT_DOWNGRADE_CONDITION,
  });
}

function manifest(text) {
  const section = extractSection(text, "Closeout Manifest");
  const fields = new Set();
  const values = new Map();
  for (const line of section.split(/\r?\n/)) {
    const match = line.match(/^-\s+\*\*([^*]+)\*\*:\s*(.*)$/);
    if (!match) continue;
    const field = match[1].trim().toLowerCase();
    fields.add(field);
    values.set(field, match[2].trim());
  }
  return { section, fields, values };
}

function uncheckedCriteria(text) {
  return extractSection(text, "Acceptance Criteria")
    .split(/\r?\n/)
    .filter((line) => /^-\s+\[\s\]/.test(line))
    .map((line) => line.trim());
}

function hasValue(value) {
  if (!value) return false;
  const normalized = value.replace(/`/g, "").trim().toLowerCase();
  return normalized !== "" && normalized !== "tbd" && normalized !== "none yet";
}

function criterionKey(criterion) {
  const text = criterion.replace(/^-\s+\[\s\]\s*/, "").replace(/\s*\[(?:waived|waiver):[^\]]+\]\s*$/i, "").trim();
  const id = text.match(/^\[([A-Za-z]+-\d+)\]/)?.[1] ?? null;
  return { id, text };
}

function hasWaiver(criterion, manifestValues) {
  if (/\[(?:waived|waiver):\s*[^\]]+\]/i.test(criterion)) return true;
  const waiver = manifestValues.get("acceptance waivers") ?? "";
  const normalizedWaiver = waiver.toLowerCase();
  if (!hasValue(waiver) || normalizedWaiver === "none") return false;
  const { id, text } = criterionKey(criterion);
  return Boolean((id && normalizedWaiver.includes(id.toLowerCase())) || (text && normalizedWaiver.includes(text.toLowerCase())));
}

const configuredDocRoots = config.docs.roots.map(normalizeRootPath);
const docRootIssues = config.docs.roots
  .filter((docRoot) => !exists(docRoot))
  .map((docRoot) => makeIssue(
    "DOC_ROOT_MISSING",
    "error",
    docRoot,
    { path: docRoot },
    "Create the configured docs root or remove the stale path from .agentic-doc-governance.json.",
    "Do not close out features while configured documentation roots are missing.",
  ));

function backlogRows(featureId) {
  if (!exists(closeoutConfig.backlogPath)) return [];
  const rows = [];
  for (const line of readText(closeoutConfig.backlogPath).split(/\r?\n/)) {
    if (!line.startsWith(`| \`${featureId}\``)) continue;
    const cells = parseMarkdownTableRow(line);
    if (cells.length < 6) {
      rows.push({ malformedLine: line });
      continue;
    }
    const link = cells.at(-1)?.match(/\]\(([^)]+)\)/)?.[1] ?? null;
    let docPath = null;
    let linkError = null;
    let linkErrorCode = null;
    if (link) {
      try {
        docPath = normalizeLink(closeoutConfig.backlogPath, link, configuredDocRoots, {
          outsideRootMessage: "Local link target escapes configured root",
        });
      } catch (error) {
        linkError = error.message;
        linkErrorCode = linkIssueCode(error);
      }
    }
    rows.push({
      status: normalizeFeatureStatus(cells[2]),
      priority: cells[3]?.replace(/`/g, "").trim() ?? "",
      docPath,
      linkError,
      linkErrorCode,
    });
  }
  return rows;
}

function findFeatureDocs(featureId) {
  return walk(closeoutConfig.featureRoot, (file) => {
    const base = path.basename(file);
    return (base === `${featureId}.md` || base.startsWith(`${featureId}-`)) && base.endsWith(".md");
  });
}

function evaluate(featureId, featurePath, text, rowStatus) {
  const issues = [];
  const metadata = parseMetadata(text);
  const status = normalizeFeatureStatus(metadata.Status);
  const riskTier = metadata["Risk tier"]?.replace(/`/g, "");
  const formalTier = closeoutConfig.formalRiskTiers.includes(riskTier);
  const closeout = manifest(text);

  if (!rowStatus) {
    addIssue(issues, "BACKLOG_ROW_MISSING", "error", closeoutConfig.backlogPath, { featureId }, "Add a backlog row for this feature before closeout.", "Do not close out a feature that is not traceable from the active backlog.");
  } else if (!isValidFeatureStatus(rowStatus)) {
    addIssue(issues, "BACKLOG_STATUS_INVALID", "error", closeoutConfig.backlogPath, { featureId, status: rowStatus, allowedStatuses: validFeatureStatusList() }, "Use one of the allowed feature lifecycle statuses in the backlog row.", "Do not invent a new lifecycle status.");
  }
  if (!isValidFeatureStatus(status)) {
    addIssue(issues, "FEATURE_STATUS_INVALID", "error", featurePath, { featureId, status, allowedStatuses: validFeatureStatusList() }, "Use one of the allowed feature lifecycle statuses in feature metadata.", "Do not invent a new lifecycle status.");
  }
  if (rowStatus && status !== rowStatus) {
    addIssue(issues, "FEATURE_STATUS_MISMATCH", "error", featurePath, { featureId, featureStatus: status, backlogStatus: rowStatus }, "Align feature and backlog status.", "Do not leave status drift in prose.");
  }
  if (!closeoutConfig.validRiskTiers.includes(riskTier)) {
    addIssue(issues, "RISK_TIER_INVALID", "error", featurePath, { featureId, riskTier }, "Set Risk tier to T1, T2, or T3.", "Do not leave risk implicit.");
  }
  if (formalTier) {
    for (const field of closeoutConfig.requiredMetadataFields) {
      if (!hasValue(metadata[field])) {
        addIssue(issues, "CLOSEOUT_METADATA_MISSING", "error", featurePath, { featureId, field }, "Fill the metadata field.", "Do not bury the value only in prose.");
      }
    }
  }
  if (status === "SHIPPED") {
    for (const criterion of uncheckedCriteria(text)) {
      if (hasWaiver(criterion, closeout.values)) continue;
      addIssue(issues, "SHIPPED_ACCEPTANCE_INCOMPLETE", "error", featurePath, { featureId, criterion }, "Complete, unship, or document an accepted waiver.", "Do not silently ship unchecked criteria.");
    }
  }
  if (formalTier && status === "SHIPPED") {
    if (!closeout.section) {
      addIssue(issues, "CLOSEOUT_MANIFEST_MISSING", "error", featurePath, { featureId }, "Add Closeout Manifest.", "Do not use status notes as a substitute.");
    } else {
      for (const field of closeoutConfig.requiredManifestFields) {
        if (!closeout.fields.has(field)) {
          addIssue(issues, "CLOSEOUT_FIELD_MISSING", "error", featurePath, { featureId, field }, "Fill the missing closeout field.", "Do not omit side-effect decisions.");
        } else if (!hasValue(closeout.values.get(field))) {
          addIssue(issues, "CLOSEOUT_FIELD_EMPTY", "error", featurePath, { featureId, field }, "Fill the closeout field with a concrete value or explicit none/not required decision.", "Do not leave shipped closeout decisions blank or TBD.");
        }
      }
    }
  }
  return issues;
}

function shippedFixture({
  status = "SHIPPED",
  uncheckedCriterion = "- [ ] Deferred item",
  acceptanceWaivers = "Deferred item waived in fixture",
  runtimeContract = "none",
  verification = "self-test",
} = {}) {
  return `> Status: \`${status}\`
> Owner: \`engineering\`
> Source of truth for: self-test
> Risk tier: \`T2\`
> Primary skill: \`implementation-surface\`
> Required gates: closeout check
> Verification: self-test
> Closeout evidence: manifest
> Indexed by: \`docs/canonical/active-backlog.md\`

# FEAT-999 - Self Test

## Acceptance Criteria

- [x] Done
${uncheckedCriterion}

## Closeout Manifest

- **Runtime contract**: ${runtimeContract}
- **Verification**: ${verification}
- **Legal outcome**: none
- **AI outcome**: none
- **Runbook outcome**: none
- **Release outcome**: none
- **Semantic review**: not required
- **Acceptance waivers**: ${acceptanceWaivers}
- **Residual risks**: none
`;
}

function runSelfTest() {
  const cases = [
    {
      name: "valid shipped T2 with manifest waiver passes",
      expectedErrors: 0,
      issues: evaluate("FEAT-999", "fixture.md", shippedFixture(), "SHIPPED"),
    },
    {
      name: "missing backlog row fails",
      expectedErrors: 1,
      expectedCodes: ["BACKLOG_ROW_MISSING"],
      issues: evaluate("FEAT-999", "fixture.md", shippedFixture(), null),
    },
    {
      name: "invalid feature status fails",
      expectedErrors: 2,
      expectedCodes: ["FEATURE_STATUS_INVALID", "FEATURE_STATUS_MISMATCH"],
      issues: evaluate("FEAT-999", "fixture.md", shippedFixture({ status: "DONE" }), "SHIPPED"),
    },
    {
      name: "invalid backlog status fails",
      expectedErrors: 2,
      expectedCodes: ["BACKLOG_STATUS_INVALID", "FEATURE_STATUS_MISMATCH"],
      issues: evaluate("FEAT-999", "fixture.md", shippedFixture(), "DONE"),
    },
    {
      name: "status mismatch fails",
      expectedErrors: 1,
      expectedCodes: ["FEATURE_STATUS_MISMATCH"],
      issues: evaluate("FEAT-999", "fixture.md", shippedFixture({ status: "VERIFYING" }), "SHIPPED"),
    },
    {
      name: "unchecked acceptance without waiver fails",
      expectedErrors: 1,
      expectedCodes: ["SHIPPED_ACCEPTANCE_INCOMPLETE"],
      issues: evaluate("FEAT-999", "fixture.md", shippedFixture({ acceptanceWaivers: "none" }), "SHIPPED"),
    },
    {
      name: "empty shipped manifest values fail",
      expectedErrors: 2,
      expectedCodes: ["CLOSEOUT_FIELD_EMPTY"],
      issues: evaluate("FEAT-999", "fixture.md", shippedFixture({ runtimeContract: "", verification: "TBD" }), "SHIPPED"),
    },
    {
      name: "inline acceptance waiver passes",
      expectedErrors: 0,
      issues: evaluate("FEAT-999", "fixture.md", shippedFixture({
        uncheckedCriterion: "- [ ] Deferred item [waived: synthetic fixture]",
        acceptanceWaivers: "none",
      }), "SHIPPED"),
    },
  ];

  const results = cases.map((testCase) => {
    const errorCodes = testCase.issues.filter((item) => item.severity === "error").map((item) => item.code);
    const expectedCodes = testCase.expectedCodes ?? [];
    const expectedMatched = expectedCodes.every((code) => errorCodes.includes(code));
    return {
      name: testCase.name,
      expectedErrors: testCase.expectedErrors,
      actualErrors: errorCodes.length,
      expectedCodes,
      actualCodes: errorCodes,
      ok: errorCodes.length === testCase.expectedErrors && expectedMatched,
    };
  });

  return {
    ok: results.every((result) => result.ok),
    cases: results,
  };
}

if (selfTest) {
  const report = runSelfTest();
  if (jsonMode) console.log(JSON.stringify(report, null, 2));
  else console.log(report.ok ? "Agent closeout checker self-test passed." : "Agent closeout checker self-test failed.");
  process.exit(report.ok ? 0 : 1);
}

if (!featureArg) {
  console.error("Missing required --feature FEAT-xxx argument.");
  process.exit(2);
}
if (!/^FEAT-\d+$/.test(featureArg)) {
  console.error("Invalid --feature value. Expected a feature ID like FEAT-001.");
  process.exit(2);
}

const featureDocs = findFeatureDocs(featureArg);
const rows = backlogRows(featureArg);
const row = rows.find((candidate) => !candidate.malformedLine) ?? null;
const backlogParseIssue = row?.linkError
  ? {
      code: row.linkErrorCode ?? "MALFORMED_INTERNAL_LINK",
      severity: "error",
      ownerDoc: closeoutConfig.backlogPath,
      relatedDocs: [],
      observed: { featureId: featureArg, error: row.linkError },
      rationale: "Backlog Primary doc link must be parseable.",
      recommendedFix: "Use a valid markdown link target or percent-encode the path correctly.",
      forbiddenFix: "Do not close out while backlog traceability is ambiguous.",
      downgradeCondition: "Do not downgrade.",
      confidence: 1,
    }
  : null;
const backlogDuplicateIssue = rows.length > 1
  ? {
      code: "BACKLOG_ROW_DUPLICATE",
      severity: "error",
      ownerDoc: closeoutConfig.backlogPath,
      relatedDocs: [],
      observed: { featureId: featureArg, rowCount: rows.length },
      rationale: "A formal feature must have exactly one active backlog row.",
      recommendedFix: "Keep one active backlog row for this feature ID.",
      forbiddenFix: "Do not close out from competing backlog rows.",
      downgradeCondition: "Do not downgrade.",
      confidence: 1,
    }
  : null;
const backlogMalformedIssue = rows.find((candidate) => candidate.malformedLine)
  ? {
      code: "BACKLOG_ROW_MALFORMED",
      severity: "error",
      ownerDoc: closeoutConfig.backlogPath,
      relatedDocs: [],
      observed: { featureId: featureArg },
      rationale: "Backlog rows must preserve the configured feature table contract.",
      recommendedFix: "Use the configured backlog columns: ID, Feature, Status, Priority, Summary, Primary doc.",
      forbiddenFix: "Do not close out from a partial backlog row.",
      downgradeCondition: "Do not downgrade.",
      confidence: 1,
    }
  : null;
const backlogPriorityIssue = row && !closeoutConfig.validPriorities.includes(row.priority)
  ? {
      code: "BACKLOG_PRIORITY_INVALID",
      severity: "error",
      ownerDoc: closeoutConfig.backlogPath,
      relatedDocs: [],
      observed: { featureId: featureArg, priority: row.priority, allowedPriorities: closeoutConfig.validPriorities },
      rationale: "Backlog priority must use the configured vocabulary.",
      recommendedFix: "Use one of the configured backlog priorities.",
      forbiddenFix: "Do not invent priority labels without updating governance config.",
      downgradeCondition: "Do not downgrade.",
      confidence: 1,
    }
  : null;
let featurePath = featureDocs[0] ?? null;
let issues;

if (featureDocs.length > 1) {
  featurePath = null;
  issues = [{
    code: "FEAT_OWNER_DUPLICATE",
    severity: "error",
    ownerDoc: closeoutConfig.featureRoot,
    relatedDocs: featureDocs,
    observed: { featureId: featureArg, ownerDocs: featureDocs },
    rationale: "A formal feature must have exactly one active owner doc.",
    recommendedFix: "Keep one feature owner doc and archive or merge duplicates before closeout.",
    forbiddenFix: "Do not close out from an arbitrary matching feature doc.",
    downgradeCondition: "Do not downgrade.",
    confidence: 1,
  }];
} else if (featurePath) {
  issues = evaluate(featureArg, featurePath, readText(featurePath), row?.status ?? null);
  if (row && !row.docPath && !row.linkError) {
    addIssue(
      issues,
      "FEAT_BACKLOG_DOC_MISSING",
      "error",
      closeoutConfig.backlogPath,
      { featureId: featureArg },
      "Add a Primary doc link from the backlog row to the feature owner doc.",
      "Do not rely on feature IDs alone for owner-doc traceability.",
    );
  } else if (row?.docPath && row.docPath !== featurePath) {
    addIssue(
      issues,
      "FEAT_BACKLOG_DOC_MISMATCH",
      "error",
      closeoutConfig.backlogPath,
      { featureId: featureArg, backlogDocPath: row.docPath, ownerDoc: featurePath },
      "Point the backlog Primary doc link at the single active feature owner doc.",
      "Do not close out a feature whose backlog index points elsewhere.",
    );
  }
} else {
  issues = [{
      code: "FEATURE_NOT_FOUND",
      severity: "error",
      ownerDoc: closeoutConfig.featureRoot,
      relatedDocs: [],
      observed: { featureId: featureArg },
      rationale: "Feature owner doc is required.",
      recommendedFix: "Create the feature owner doc.",
      forbiddenFix: "Do not close out from chat history alone.",
      downgradeCondition: "Do not downgrade.",
      confidence: 1,
    }];
}

issues.push(...docRootIssues);
if (backlogParseIssue) issues.push(backlogParseIssue);
if (backlogDuplicateIssue) issues.push(backlogDuplicateIssue);
if (backlogMalformedIssue) issues.push(backlogMalformedIssue);
if (backlogPriorityIssue) issues.push(backlogPriorityIssue);

const report = { ok: issues.every((item) => item.severity !== "error"), root, featureId: featureArg, featurePath, issues };

if (jsonMode) console.log(JSON.stringify(report, null, 2));
else if (report.ok) console.log("Agent closeout check passed: no issues found.");
else {
  console.log(`Agent closeout check found ${issues.length} issue(s):`);
  for (const item of issues) console.log(`- [${item.severity}] ${item.code} ${item.ownerDoc} ${JSON.stringify(item.observed)}`);
}

process.exit(report.ok ? 0 : 1);
