#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parseArgs, UsageError } from "./lib/args.mjs";
import { loadGovernanceConfig } from "./lib/config.mjs";
import { isValidFeatureStatus, normalizeFeatureStatus, validFeatureStatusList } from "./lib/feature-lifecycle.mjs";
import {
  extractLinks,
  extractFirstInlineLinkDestination,
  hasSection,
  linkIssueCode,
  makeIssue,
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
      "check-generated": { type: "boolean" },
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

if (help) {
  console.log(`Usage: node scripts/docs-integrity-check.mjs [--root <dir>] [--check-generated] [--json]`);
  process.exit(0);
}

if (options.positionals.length > 0) {
  console.error(`docs-integrity-check does not accept positional arguments: ${options.positionals.join(" ")}`);
  process.exit(2);
}

const checkGenerated = Boolean(options.flags["check-generated"]);
const root = path.resolve(options.flags.root ?? process.cwd());
let config;
try {
  config = loadGovernanceConfig(root);
} catch (error) {
  console.error(error.message);
  process.exit(error.exitCode ?? 1);
}

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

function installedSkillNames() {
  const skills = new Set();
  for (const skillRoot of config.skills.roots) {
    if (!exists(skillRoot) || !fs.statSync(abs(skillRoot)).isDirectory()) continue;
    for (const entry of fs.readdirSync(abs(skillRoot), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillFile = `${skillRoot}/${entry.name}/SKILL.md`;
      if (exists(skillFile)) skills.add(entry.name);
    }
  }
  return skills;
}

const DOC_DOWNGRADE_CONDITION = "Change this rule only through documentation-governance or agent-execution-contract policy.";

function issue(code, severity, ownerDoc, observed, recommendedFix, forbiddenFix) {
  return makeIssue({
    code,
    severity,
    ownerDoc,
    observed,
    recommendedFix,
    forbiddenFix,
    downgradeCondition: DOC_DOWNGRADE_CONDITION,
  });
}

function featureIdFromPath(file) {
  return path.basename(file).match(/^(FEAT-\d+)/)?.[1] ?? null;
}

function parseBacklogRows() {
  const backlogPath = config.closeout.backlogPath;
  if (!exists(backlogPath)) return new Map();
  const rows = new Map();
  for (const line of readText(backlogPath).split(/\r?\n/)) {
    if (!line.startsWith("| `FEAT-")) continue;
    const cells = parseMarkdownTableRow(line);
    if (cells.length < 6) {
      issues.push(issue(
        "BACKLOG_ROW_MALFORMED",
        "error",
        backlogPath,
        { line },
        "Use the configured backlog columns: ID, Feature, Status, Priority, Summary, Primary doc.",
        "Do not keep partial feature rows in the active backlog.",
      ));
      continue;
    }
    const id = cells[0].replace(/`/g, "");
    const status = normalizeFeatureStatus(cells[2]);
    const priority = cells[3]?.replace(/`/g, "").trim() ?? "";
    if (rows.has(id)) {
      issues.push(issue(
        "BACKLOG_ROW_DUPLICATE",
        "error",
        backlogPath,
        { id },
        "Keep exactly one active backlog row per feature ID.",
        "Do not let duplicate backlog rows compete as sources of truth.",
      ));
      continue;
    }
    if (!isValidFeatureStatus(status)) {
      issues.push(issue(
        "BACKLOG_STATUS_INVALID",
        "error",
        backlogPath,
        { id, status, allowedStatuses: validFeatureStatusList() },
        "Use one of the allowed feature lifecycle statuses in the backlog row.",
        "Do not invent a new lifecycle status.",
      ));
    }
    if (!config.closeout.validPriorities.includes(priority)) {
      issues.push(issue(
        "BACKLOG_PRIORITY_INVALID",
        "error",
        backlogPath,
        { id, priority, allowedPriorities: config.closeout.validPriorities },
        "Use one of the configured backlog priorities.",
        "Do not invent priority labels without updating governance config.",
      ));
    }
    const link = extractFirstInlineLinkDestination(cells.at(-1) ?? "");
    let docPath = null;
    let linkError = null;
    if (link) {
      try {
        docPath = normalizeLink(backlogPath, link, configuredDocRoots);
      } catch (error) {
        linkError = error.message;
        issues.push(issue(
          linkIssueCode(error),
          "error",
          backlogPath,
          { target: link, error: error.message },
          "Use a valid markdown link target or percent-encode the path correctly.",
          "Do not leave malformed local links that make docs tooling ambiguous.",
        ));
      }
    }
    rows.set(id, {
      status,
      priority,
      docPath,
      linkError,
    });
  }
  return rows;
}

const issues = [];
for (const docRoot of config.docs.roots) {
  if (!exists(docRoot)) {
    issues.push(issue(
      "DOC_ROOT_MISSING",
      "error",
      docRoot,
      { path: docRoot },
      "Create the configured docs root or remove the stale path from .agentic-doc-governance.json.",
      "Do not silently skip a configured documentation root.",
    ));
  }
}
const docRoots = config.docs.roots.filter(exists);
const configuredDocRoots = docRoots.map(normalizeRootPath);
const docs = docRoots.flatMap((dir) => walk(dir, (file) => file.endsWith(".md")));
const installedSkills = installedSkillNames();

if (checkGenerated) {
  for (const requiredPath of config.generated.requiredPaths) {
    if (!exists(requiredPath)) {
      issues.push(issue(
        "GENERATED_PATH_MISSING",
        "error",
        requiredPath,
        { path: requiredPath },
        "Restore the missing generated governance file or update .agentic-doc-governance.json if the project intentionally owns a different footprint.",
        "Do not pass --check-generated while silently omitting generated governance files.",
      ));
    }
  }
}

for (const doc of docs) {
  for (const rawLink of extractLinks(readText(doc))) {
    let target;
    try {
      target = normalizeLink(doc, rawLink, configuredDocRoots);
    } catch (error) {
      issues.push(issue(
        linkIssueCode(error),
        "error",
        doc,
        { target: rawLink, error: error.message },
        "Use a valid markdown link target or percent-encode the path correctly.",
        "Do not leave malformed local links that make docs tooling ambiguous.",
      ));
      continue;
    }
    if (!target) continue;
    if (!exists(target)) {
      issues.push(issue(
        "BROKEN_INTERNAL_LINK",
        "error",
        doc,
        { target: rawLink, resolvedPath: target },
        "Fix the markdown link target or restore the referenced file.",
        "Do not leave broken internal links in active docs.",
      ));
    }
  }
}

const featureRoot = config.closeout.featureRoot;
const backlogPath = config.closeout.backlogPath;
const featureRootExists = exists(featureRoot);
const backlogExists = exists(backlogPath);

if (!featureRootExists && backlogExists) {
  issues.push(issue(
    "FEATURE_ROOT_MISSING",
    "error",
    featureRoot,
    { path: featureRoot, backlogPath },
    "Create the configured feature owner-doc root or update closeout.featureRoot.",
    "Do not leave backlog feature rows without a configured owner-doc root.",
  ));
} else if (featureRootExists && !backlogExists) {
  const featureDocs = walk(featureRoot, (file) => /^FEAT-\d+.*\.md$/.test(path.basename(file)));
  if (featureDocs.length > 0) {
    issues.push(issue(
      "FEATURE_BACKLOG_MISSING",
      "error",
      backlogPath,
      { path: backlogPath, featureRoot, featureDocs },
      "Create the configured active backlog or update closeout.backlogPath.",
      "Do not leave active feature owner docs without a backlog index.",
    ));
  }
}

if (featureRootExists && backlogExists) {
  const backlogRows = parseBacklogRows();
  const featureDocs = walk(featureRoot, (file) => /^FEAT-\d+.*\.md$/.test(path.basename(file)));
  const docsByFeatureId = new Map();
  for (const featureDoc of featureDocs) {
    const id = featureIdFromPath(featureDoc);
    if (!id) continue;
    docsByFeatureId.set(id, [...(docsByFeatureId.get(id) ?? []), featureDoc]);
  }
  for (const [id, matchingDocs] of docsByFeatureId) {
    if (!id || matchingDocs.length <= 1) continue;
    issues.push(issue(
      "FEAT_OWNER_DUPLICATE",
      "error",
      featureRoot,
      { id, ownerDocs: matchingDocs },
      "Keep exactly one feature owner doc for this feature ID and archive or merge duplicates.",
      "Do not split one formal feature across parallel active owner docs.",
    ));
  }
  for (const featureDoc of featureDocs) {
    const id = featureIdFromPath(featureDoc);
    if (!id) continue;
    const text = readText(featureDoc);
    const metadata = parseMetadata(text);
    const row = backlogRows.get(id);
    const featureStatus = normalizeFeatureStatus(metadata.Status);
    const riskTier = metadata["Risk tier"]?.replace(/`/g, "").trim() ?? "";
    const primarySkill = metadata["Primary skill"]?.replace(/`/g, "").trim() ?? "";
    for (const section of config.closeout.requiredFeatureSections) {
      if (!hasSection(text, section)) {
        issues.push(issue(
          "FEATURE_SECTION_MISSING",
          "error",
          featureDoc,
          { id, section },
          "Restore the required feature owner doc section or update closeout.requiredFeatureSections in governance config.",
          "Do not leave formal feature owner docs without their planning and verification structure.",
        ));
      }
    }
    if (!isValidFeatureStatus(featureStatus)) {
      issues.push(issue(
        "FEAT_STATUS_INVALID",
        "error",
        featureDoc,
        { id, status: featureStatus, allowedStatuses: validFeatureStatusList() },
        "Use one of the allowed feature lifecycle statuses in the feature doc metadata.",
        "Do not invent a new lifecycle status.",
      ));
    }
    if (!config.closeout.validRiskTiers.includes(riskTier)) {
      issues.push(issue(
        "RISK_TIER_INVALID",
        "error",
        featureDoc,
        { id, riskTier, allowedRiskTiers: config.closeout.validRiskTiers },
        "Use one of the configured risk tiers in feature metadata.",
        "Do not leave risk implicit or invent new tiers without updating governance config.",
      ));
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(primarySkill)) {
      issues.push(issue(
        "FEAT_SKILL_INVALID",
        "error",
        featureDoc,
        { id, primarySkill },
        "Use a repo-local skill name like feature-lifecycle.",
        "Do not route feature work through malformed skill names.",
      ));
    } else if (installedSkills.size > 0 && !installedSkills.has(primarySkill)) {
      issues.push(issue(
        "FEAT_SKILL_MISSING",
        "error",
        featureDoc,
        { id, primarySkill },
        "Add the skill to the repo-local skill registry or update the feature metadata to an installed skill.",
        "Do not route feature work through unavailable skills.",
      ));
    }
    if (!row) {
      issues.push(issue("FEAT_BACKLOG_LINK_MISSING", "error", featureDoc, { id }, "Add a backlog row for this feature.", "Do not create a second feature owner doc."));
    } else {
      if (!row.docPath && !row.linkError) {
        issues.push(issue(
          "FEAT_BACKLOG_DOC_MISSING",
          "error",
          backlogPath,
          { id },
          "Add a Primary doc link from the backlog row to the feature owner doc.",
          "Do not rely on feature IDs alone for owner-doc traceability.",
        ));
      } else if (row.docPath && row.docPath !== featureDoc) {
        issues.push(issue(
          "FEAT_BACKLOG_DOC_MISMATCH",
          "error",
          backlogPath,
          { id, backlogDocPath: row.docPath, ownerDoc: featureDoc },
          "Point the backlog Primary doc link at the single active feature owner doc.",
          "Do not leave the backlog indexed to a stale or parallel owner doc.",
        ));
      }
      if (featureStatus !== row.status) {
        issues.push(issue("FEAT_STATUS_MISMATCH", "error", featureDoc, { id, featureStatus, backlogStatus: row.status }, "Align feature doc and backlog statuses.", "Do not explain status drift only in prose."));
      }
    }
  }
  for (const [id, row] of backlogRows) {
    if (docsByFeatureId.has(id)) continue;
    issues.push(issue(
      "FEAT_OWNER_MISSING",
      "error",
      backlogPath,
      { id, backlogDocPath: row.docPath },
      "Create the referenced feature owner doc or remove/archive the stale backlog row.",
      "Do not keep active backlog rows that cannot be traced to a feature owner doc.",
    ));
  }
}

const report = {
  ok: issues.every((item) => item.severity !== "error"),
  root,
  checkGenerated,
  issues,
};

if (jsonMode) console.log(JSON.stringify(report, null, 2));
else if (report.ok) console.log("DOC-INTEGRITY PASS\nErrors: 0\nWarnings: 0");
else {
  console.log(`DOC-INTEGRITY FAIL\nErrors: ${issues.filter((item) => item.severity === "error").length}`);
  for (const item of issues) console.log(`- [${item.severity}] ${item.code} ${item.ownerDoc} ${JSON.stringify(item.observed)}`);
}

process.exit(report.ok ? 0 : 1);
