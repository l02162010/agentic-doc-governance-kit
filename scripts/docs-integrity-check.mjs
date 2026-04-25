#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parseArgs, UsageError } from "./lib/args.mjs";
import { loadGovernanceConfig } from "./lib/config.mjs";
import { isValidFeatureStatus, normalizeFeatureStatus, validFeatureStatusList } from "./lib/feature-lifecycle.mjs";

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
const config = loadGovernanceConfig(root);

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

function issue(code, severity, ownerDoc, observed, recommendedFix, forbiddenFix) {
  return {
    code,
    severity,
    ownerDoc,
    relatedDocs: [],
    observed,
    rationale: code,
    recommendedFix,
    forbiddenFix,
    downgradeCondition: "Change this rule only through documentation-governance or agent-execution-contract policy.",
    confidence: 1,
  };
}

function normalizeLink(ownerDoc, rawTarget) {
  let target = rawTarget.trim().replace(/^<|>$/g, "").split("#")[0];
  if (!target || /^(https?:|mailto:|tel:|app:\/\/)/.test(target)) return null;
  if (target.startsWith("/")) target = target.slice(1);
  return path.normalize(path.join(path.dirname(ownerDoc), decodeURIComponent(target))).split(path.sep).join("/");
}

function extractLinks(text) {
  return [...text.matchAll(/!?\[[^\]\n]*\]\((<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\)/g)].map((match) => match[1]);
}

function parseMetadata(text) {
  const metadata = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith(">")) break;
    const match = line.match(/^>\s*([^:]+):\s*(.*)\s*$/);
    if (match) metadata[match[1].trim()] = match[2].trim().replace(/^`|`$/g, "");
  }
  return metadata;
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
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 6) continue;
    const id = cells[0].replace(/`/g, "");
    const link = cells.at(-1)?.match(/\]\(([^)]+)\)/)?.[1] ?? null;
    let docPath = null;
    let linkError = null;
    if (link) {
      try {
        docPath = normalizeLink(backlogPath, link);
      } catch (error) {
        linkError = error.message;
        issues.push(issue(
          "MALFORMED_INTERNAL_LINK",
          "error",
          backlogPath,
          { target: link, error: error.message },
          "Use a valid markdown link target or percent-encode the path correctly.",
          "Do not leave malformed local links that make docs tooling ambiguous.",
        ));
      }
    }
    rows.set(id, {
      status: normalizeFeatureStatus(cells[2]),
      docPath,
      linkError,
    });
  }
  return rows;
}

const issues = [];
const docRoots = config.docs.roots.filter(exists);
const docs = docRoots.flatMap((dir) => walk(dir, (file) => file.endsWith(".md")));

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
      target = normalizeLink(doc, rawLink);
    } catch (error) {
      issues.push(issue(
        "MALFORMED_INTERNAL_LINK",
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

if (exists(featureRoot) && exists(backlogPath)) {
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
    const metadata = parseMetadata(readText(featureDoc));
    const row = backlogRows.get(id);
    const featureStatus = normalizeFeatureStatus(metadata.Status);
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
      if (!isValidFeatureStatus(row.status)) {
        issues.push(issue(
          "BACKLOG_STATUS_INVALID",
          "error",
          backlogPath,
          { id, status: row.status, allowedStatuses: validFeatureStatusList() },
          "Use one of the allowed feature lifecycle statuses in the backlog row.",
          "Do not invent a new lifecycle status.",
        ));
      }
      if (featureStatus !== row.status) {
        issues.push(issue("FEAT_STATUS_MISMATCH", "error", featureDoc, { id, featureStatus, backlogStatus: row.status }, "Align feature doc and backlog statuses.", "Do not explain status drift only in prose."));
      }
    }
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
