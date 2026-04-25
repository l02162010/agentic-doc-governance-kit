#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parseArgs, UsageError } from "./lib/args.mjs";
import { loadGovernanceConfig } from "./lib/config.mjs";

let options;
try {
  options = parseArgs(process.argv.slice(2), {
    aliases: { h: "help" },
    flags: {
      root: { type: "string" },
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
  console.log(`Usage: node scripts/skills-integrity-check.mjs [--root <dir>] [--json]`);
  process.exit(0);
}

if (options.positionals.length > 0) {
  console.error(`skills-integrity-check does not accept positional arguments: ${options.positionals.join(" ")}`);
  process.exit(2);
}

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
    downgradeCondition: "Change this rule only through agent-execution-contract or skill registry governance.",
    confidence: 1,
  });
}

function discoverSkillRoots() {
  return config.skills.roots.filter(exists);
}

function installedSkills(skillRoot) {
  const out = new Map();
  for (const entry of fs.readdirSync(abs(skillRoot), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillFile = `${skillRoot}/${entry.name}/SKILL.md`;
    if (exists(skillFile)) out.set(entry.name, skillFile);
  }
  return out;
}

function registrySkills(skillRoot) {
  const readme = `${skillRoot}/README.md`;
  if (!exists(readme)) return new Set();
  return new Set([...readText(readme).matchAll(/`([a-z0-9][a-z0-9-]+)`/g)].map((match) => match[1]));
}

function agentsSkillRefs() {
  if (!exists("AGENTS.md")) return new Set();
  const text = readText("AGENTS.md");
  return new Set([...text.matchAll(/(?:use|invoke)\s+`([a-z0-9][a-z0-9-]+)`/gi)].map((match) => match[1]));
}

const issues = [];
const roots = discoverSkillRoots();
const allInstalled = new Map();

for (const skillRoot of roots) {
  const installed = installedSkills(skillRoot);
  const registry = registrySkills(skillRoot);
  for (const [skill, skillFile] of installed) {
    allInstalled.set(skill, skillFile);
    if (!registry.has(skill)) {
      addIssue(issues, "SKILL_REGISTRY_MISSING_ENTRY", "error", `${skillRoot}/README.md`, { skill }, "Add the skill to the registry.", "Do not hide repo-local skills from the registry.");
    }
    const text = readText(skillFile);
    for (const heading of ["## Scope", "## Default workflow", "## Output format"]) {
      if (!text.includes(heading)) {
        addIssue(issues, "SKILL_STRUCTURE_WEAK", "warning", skillFile, { skill, missingHeading: heading }, "Add the missing standard heading.", "Do not split required skill instructions into undocumented files.");
      }
    }
  }
  for (const skill of registry) {
    if (!installed.has(skill)) {
      addIssue(issues, "SKILL_REGISTRY_MISSING_SKILL", "error", `${skillRoot}/README.md`, { skill }, "Create the missing SKILL.md or remove the stale row.", "Do not advertise unavailable skills.");
    }
  }
}

for (const skill of agentsSkillRefs()) {
  if (!allInstalled.has(skill)) {
    addIssue(issues, "AGENTS_SKILL_REFERENCE_MISSING", "error", "AGENTS.md", { skill }, "Fix the AGENTS.md route or add the missing skill.", "Do not route agents to nonexistent skills.");
  }
}

const report = { ok: issues.every((item) => item.severity !== "error"), root, issues };

if (jsonMode) console.log(JSON.stringify(report, null, 2));
else if (report.ok) console.log("Skills integrity check passed: no issues found.");
else {
  console.log(`Skills integrity check found ${issues.length} issue(s):`);
  for (const item of issues) console.log(`- [${item.severity}] ${item.code} ${item.ownerDoc} ${JSON.stringify(item.observed)}`);
}

process.exit(report.ok ? 0 : 1);
