#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const help = args.includes("--help") || args.includes("-h");
const checkGenerated = args.includes("--check-generated");
const root = path.resolve(valueFor("--root") ?? process.cwd());

if (help) {
  console.log(`Usage: node scripts/docs-integrity-check.mjs [--root <dir>] [--check-generated] [--json]`);
  process.exit(0);
}

function valueFor(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] ?? null;
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
  if (!exists("docs/canonical/active-backlog.md")) return new Map();
  const rows = new Map();
  for (const line of readText("docs/canonical/active-backlog.md").split(/\r?\n/)) {
    if (!line.startsWith("| `FEAT-")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 6) continue;
    const id = cells[0].replace(/`/g, "");
    const link = cells.at(-1)?.match(/\]\(([^)]+)\)/)?.[1] ?? null;
    rows.set(id, {
      status: cells[2].replace(/`/g, ""),
      docPath: link ? normalizeLink("docs/canonical/active-backlog.md", link) : null,
    });
  }
  return rows;
}

const issues = [];
const docRoots = ["docs", "templates/docs", "examples/basic-product/docs"].filter(exists);
const docs = docRoots.flatMap((dir) => walk(dir, (file) => file.endsWith(".md")));

for (const doc of docs) {
  for (const rawLink of extractLinks(readText(doc))) {
    const target = normalizeLink(doc, rawLink);
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

if (exists("docs/canonical/features") && exists("docs/canonical/active-backlog.md")) {
  const backlogRows = parseBacklogRows();
  const featureDocs = walk("docs/canonical/features", (file) => /^FEAT-\d+.*\.md$/.test(path.basename(file)));
  for (const featureDoc of featureDocs) {
    const id = featureIdFromPath(featureDoc);
    if (!id) continue;
    const metadata = parseMetadata(readText(featureDoc));
    const row = backlogRows.get(id);
    if (!row) {
      issues.push(issue("FEAT_BACKLOG_LINK_MISSING", "error", featureDoc, { id }, "Add a backlog row for this feature.", "Do not create a second feature owner doc."));
    } else if (metadata.Status?.replace(/`/g, "") !== row.status) {
      issues.push(issue("FEAT_STATUS_MISMATCH", "error", featureDoc, { id, featureStatus: metadata.Status, backlogStatus: row.status }, "Align feature doc and backlog statuses.", "Do not explain status drift only in prose."));
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
