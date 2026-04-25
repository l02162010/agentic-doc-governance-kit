#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { isValidFeatureStatus, normalizeFeatureStatus, validFeatureStatusList } from "./lib/feature-lifecycle.mjs";

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const help = args.includes("--help") || args.includes("-h");
const selfTest = args.includes("--self-test");
const root = path.resolve(valueFor("--root") ?? process.cwd());
const featureArg = valueFor("--feature");

if (help) {
  console.log(`Usage: node scripts/agent-closeout-check.mjs --feature FEAT-xxx [--root <dir>] [--self-test] [--json]`);
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

function addIssue(issues, code, severity, ownerDoc, observed, recommendedFix, forbiddenFix) {
  issues.push({
    code,
    severity,
    ownerDoc,
    relatedDocs: [],
    observed,
    rationale: code,
    recommendedFix,
    forbiddenFix,
    downgradeCondition: "Change this rule only through agent-execution-contract or feature-lifecycle governance.",
    confidence: 1,
  });
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

function extractSection(text, heading) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return "";
  const section = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith("## ")) break;
    section.push(lines[index]);
  }
  return section.join("\n").trim();
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

function backlogStatus(featureId) {
  if (!exists("docs/canonical/active-backlog.md")) return null;
  for (const line of readText("docs/canonical/active-backlog.md").split(/\r?\n/)) {
    if (!line.startsWith(`| \`${featureId}\``)) continue;
    return normalizeFeatureStatus(line.split("|").slice(1, -1).map((cell) => cell.trim())[2]);
  }
  return null;
}

function findFeatureDoc(featureId) {
  const candidates = walk("docs/canonical/features", (file) => path.basename(file).startsWith(featureId) && file.endsWith(".md"));
  return candidates[0] ?? null;
}

function evaluate(featureId, featurePath, text, rowStatus) {
  const issues = [];
  const metadata = parseMetadata(text);
  const status = normalizeFeatureStatus(metadata.Status);
  const riskTier = metadata["Risk tier"]?.replace(/`/g, "");
  const formalTier = riskTier === "T1" || riskTier === "T2";
  const closeout = manifest(text);

  if (!rowStatus) {
    addIssue(issues, "BACKLOG_ROW_MISSING", "error", "docs/canonical/active-backlog.md", { featureId }, "Add a backlog row for this feature before closeout.", "Do not close out a feature that is not traceable from the active backlog.");
  } else if (!isValidFeatureStatus(rowStatus)) {
    addIssue(issues, "BACKLOG_STATUS_INVALID", "error", "docs/canonical/active-backlog.md", { featureId, status: rowStatus, allowedStatuses: validFeatureStatusList() }, "Use one of the allowed feature lifecycle statuses in the backlog row.", "Do not invent a new lifecycle status.");
  }
  if (!isValidFeatureStatus(status)) {
    addIssue(issues, "FEATURE_STATUS_INVALID", "error", featurePath, { featureId, status, allowedStatuses: validFeatureStatusList() }, "Use one of the allowed feature lifecycle statuses in feature metadata.", "Do not invent a new lifecycle status.");
  }
  if (rowStatus && status !== rowStatus) {
    addIssue(issues, "FEATURE_STATUS_MISMATCH", "error", featurePath, { featureId, featureStatus: status, backlogStatus: rowStatus }, "Align feature and backlog status.", "Do not leave status drift in prose.");
  }
  if (!["T1", "T2", "T3"].includes(riskTier)) {
    addIssue(issues, "RISK_TIER_INVALID", "error", featurePath, { featureId, riskTier }, "Set Risk tier to T1, T2, or T3.", "Do not leave risk implicit.");
  }
  if (formalTier) {
    for (const field of ["Status", "Owner", "Source of truth for", "Risk tier", "Primary skill", "Required gates", "Verification", "Closeout evidence", "Indexed by"]) {
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
      for (const field of ["runtime contract", "verification", "legal outcome", "ai outcome", "runbook outcome", "release outcome", "semantic review", "acceptance waivers", "residual risks"]) {
        if (!closeout.fields.has(field)) {
          addIssue(issues, "CLOSEOUT_FIELD_MISSING", "error", featurePath, { featureId, field }, "Fill the missing closeout field.", "Do not omit side-effect decisions.");
        }
      }
    }
  }
  return issues;
}

function shippedFixture({ status = "SHIPPED", uncheckedCriterion = "- [ ] Deferred item", acceptanceWaivers = "Deferred item waived in fixture" } = {}) {
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

- **Runtime contract**: none
- **Verification**: self-test
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

const featurePath = findFeatureDoc(featureArg);
const issues = featurePath
  ? evaluate(featureArg, featurePath, readText(featurePath), backlogStatus(featureArg))
  : [{
      code: "FEATURE_NOT_FOUND",
      severity: "error",
      ownerDoc: "docs/canonical/features",
      relatedDocs: [],
      observed: { featureId: featureArg },
      rationale: "Feature owner doc is required.",
      recommendedFix: "Create the feature owner doc.",
      forbiddenFix: "Do not close out from chat history alone.",
      downgradeCondition: "Do not downgrade.",
      confidence: 1,
    }];

const report = { ok: issues.every((item) => item.severity !== "error"), root, featureId: featureArg, featurePath, issues };

if (jsonMode) console.log(JSON.stringify(report, null, 2));
else if (report.ok) console.log("Agent closeout check passed: no issues found.");
else {
  console.log(`Agent closeout check found ${issues.length} issue(s):`);
  for (const item of issues) console.log(`- [${item.severity}] ${item.code} ${item.ownerDoc} ${JSON.stringify(item.observed)}`);
}

process.exit(report.ok ? 0 : 1);
