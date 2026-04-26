#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs, UsageError } from "../scripts/lib/args.mjs";
import { loadGovernanceConfig } from "../scripts/lib/config.mjs";
import { isValidFeatureStatus, validFeatureStatusList } from "../scripts/lib/feature-lifecycle.mjs";

const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2];
const args = process.argv.slice(3);

function usage() {
  console.log(`Usage:
  agentic-doc-governance init <target-dir> [--force]
  agentic-doc-governance init <target-dir> [--dry-run]
  agentic-doc-governance feature add FEAT-xxx <name> [--root <dir>] [--status IDEA] [--risk T2] [--priority P2] [--summary <text>] [--dry-run]
  agentic-doc-governance docs-check [--root <dir>] [--check-generated] [--json]
  agentic-doc-governance skills-check [--root <dir>] [--json]
  agentic-doc-governance closeout-check --feature FEAT-xxx [--root <dir>] [--json]
  agentic-doc-governance --version
`);
}

function runScript(script, extraArgs) {
  const result = spawnSync(process.execPath, [path.join(KIT_ROOT, "scripts", script), ...extraArgs], {
    stdio: "inherit",
  });
  process.exit(result.status ?? 1);
}

function packageVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, "package.json"), "utf8"));
  return pkg.version;
}

function collectFiles(sourceDir, targetDir) {
  const files = [];
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const source = path.join(sourceDir, entry.name);
    const target = path.join(targetDir, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(source, target));
    else files.push({ source, target });
  }
  return files;
}

function installFiles(target) {
  return [
    {
      source: path.join(KIT_ROOT, "AGENTS.template.md"),
      target: path.join(target, "AGENTS.md"),
    },
    ...collectFiles(path.join(KIT_ROOT, "templates"), target),
    ...collectFiles(path.join(KIT_ROOT, "scripts"), path.join(target, "scripts")),
  ];
}

function preflight(files, force) {
  const conflicts = [];
  for (const { target } of files) {
    if (fs.existsSync(target)) {
      if (!force || fs.statSync(target).isDirectory()) conflicts.push(target);
      continue;
    }

    const { root } = path.parse(target);
    let current = path.dirname(target);
    const parents = [];
    while (current && current !== root) {
      parents.push(current);
      current = path.dirname(current);
    }

    const blockingParent = parents.find((parent) => fs.existsSync(parent) && !fs.statSync(parent).isDirectory());
    if (blockingParent) conflicts.push(blockingParent);
  }

  if (conflicts.length > 0) {
    const list = [...new Set(conflicts)].map((target) => `- ${target}`).join("\n");
    throw new Error(`Refusing to overwrite existing files:\n${list}\nRe-run with --force if intentional.`);
  }
}

function copyFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function init(targetDir, { force, dryRun }) {
  if (!targetDir) {
    usage();
    process.exit(2);
  }

  const target = path.resolve(targetDir);
  const files = installFiles(target);
  preflight(files, force);

  if (dryRun) {
    console.log(`Would install Agentic Doc Governance Kit into ${target}`);
    for (const { target: file } of files) console.log(`- ${file}`);
    return;
  }

  fs.mkdirSync(target, { recursive: true });
  for (const file of files) copyFile(file.source, file.target);

  console.log(`Agentic Doc Governance Kit installed into ${target}`);
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function escapeTableCell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function slugify(value) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "feature";
}

function walk(dir, predicate = () => true) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(entryPath, predicate));
    else if (predicate(entryPath)) out.push(entryPath);
  }
  return out.sort();
}

function installedSkillNames(root, skillRoots) {
  const skills = new Set();
  for (const skillRoot of skillRoots) {
    const absRoot = path.join(root, skillRoot);
    if (!fs.existsSync(absRoot) || !fs.statSync(absRoot).isDirectory()) continue;
    for (const entry of fs.readdirSync(absRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (fs.existsSync(path.join(absRoot, entry.name, "SKILL.md"))) skills.add(entry.name);
    }
  }
  return skills;
}

function formatList(values) {
  return [...values].join(", ");
}

function assertSingleLine(label, value) {
  if (/[\r\n]/.test(value)) throw new UsageError(`${label} must be a single line.`);
}

function assertBacktickSafe(label, value) {
  if (value.includes("`")) throw new UsageError(`${label} must not contain backticks.`);
}

function basenameMatchesFeatureId(file, featureId) {
  const base = path.basename(file);
  return (base === `${featureId}.md` || base.startsWith(`${featureId}-`)) && base.endsWith(".md");
}

function featureDocText({ id, name, status, risk, owner, skill, backlogPath }) {
  return `> Status: \`${status}\`
> Owner: \`${owner}\`
> Source of truth for: ${name}
> Depends on: none
> Risk tier: \`${risk}\`
> Primary skill: \`${skill}\`
> Required gates: docs integrity, closeout check when shipped
> Legal impact: \`none\`
> AI impact: \`none\`
> Release impact: \`none\`
> Verification: define before implementation
> Closeout evidence: required before shipped
> Indexed by: \`${backlogPath}\`

# ${id} - ${name}

## Problem

TBD

## Goal

TBD

## Non-goals

TBD

## User-facing Behavior

TBD

## Scope

- TBD

## Workstreams

| ID | Scope slice | Status | Notes |
|---|---|---|---|
| \`TODO-001\` | TBD | \`PLANNED\` | TBD |

## Acceptance Criteria

- [ ] TBD

## Rollout and Verification

- TBD

## Closeout Manifest

T1/T2 features need this section when marked \`SHIPPED\`. T3 small changes do not.

- **Runtime contract**:
- **Verification**:
- **Legal outcome**:
- **AI outcome**:
- **Runbook outcome**:
- **Release outcome**:
- **Semantic review**:
- **Acceptance waivers**:
- **Residual risks**:

## Linked Artifacts

- ADR:
- Runbook:
- Logs:
- Release:
- AI docs:

## Status Notes

### ${status}

Created by \`agentic-doc-governance feature add\`.
`;
}

function backlogHeader() {
  return [
    "> Status: canonical",
    "> Role: active feature index",
    "",
    "# Active Backlog",
    "",
    "| ID | Feature | Status | Priority | Summary | Primary doc |",
    "|---|---|---|---|---|---|",
  ].join("\n");
}

function blockingParent(target) {
  const { root } = path.parse(target);
  let current = path.dirname(target);
  while (current && current !== root) {
    if (fs.existsSync(current) && !fs.statSync(current).isDirectory()) return current;
    current = path.dirname(current);
  }
  return null;
}

function preflightWritableFile(target, { mustNotExist = false } = {}) {
  if (fs.existsSync(target)) {
    if (fs.statSync(target).isDirectory()) throw new UsageError(`Cannot write file because target is a directory: ${target}`);
    if (mustNotExist) throw new UsageError(`Refusing to overwrite existing file: ${target}`);
    fs.accessSync(target, fs.constants.R_OK | fs.constants.W_OK);
    return;
  }

  const blocked = blockingParent(target);
  if (blocked) throw new UsageError(`Cannot create ${target}; parent path is a file: ${blocked}`);

  const parent = path.dirname(target);
  if (fs.existsSync(parent)) fs.accessSync(parent, fs.constants.W_OK);
}

function addFeature(argv) {
  const subcommand = argv[0];
  if (subcommand === "--help" || subcommand === "-h") {
    usage();
    process.exit(0);
  }
  if (subcommand !== "add") {
    usage();
    process.exit(2);
  }

  const options = parseArgs(argv.slice(1), {
    aliases: { h: "help" },
    flags: {
      root: { type: "string" },
      status: { type: "string" },
      risk: { type: "string" },
      priority: { type: "string" },
      summary: { type: "string" },
      owner: { type: "string" },
      skill: { type: "string" },
      "dry-run": { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  if (options.flags.help) {
    usage();
    process.exit(0);
  }

  const [featureId, ...nameParts] = options.positionals;
  const name = nameParts.join(" ").trim();
  if (!/^FEAT-\d+$/.test(featureId ?? "")) throw new UsageError("feature add requires a feature ID like FEAT-002.");
  if (!name) throw new UsageError("feature add requires a feature name.");

  const root = path.resolve(options.flags.root ?? process.cwd());
  const config = loadGovernanceConfig(root);
  const status = options.flags.status ?? "IDEA";
  const risk = options.flags.risk ?? "T2";
  const priority = options.flags.priority ?? "P2";
  const summary = options.flags.summary ?? "TBD";
  const owner = options.flags.owner ?? "engineering";
  const skill = options.flags.skill ?? "feature-lifecycle";
  const dryRun = Boolean(options.flags["dry-run"]);

  if (!isValidFeatureStatus(status)) {
    throw new UsageError(`Invalid --status ${status}. Expected one of: ${validFeatureStatusList()}.`);
  }
  if (["SHIPPED", "ARCHIVED"].includes(status)) {
    throw new UsageError(`feature add cannot create a feature directly in terminal status ${status}. Create it as IDEA, PLANNED, IN_PROGRESS, or VERIFYING, then close it out through the feature lifecycle.`);
  }
  if (!config.closeout.validRiskTiers.includes(risk)) {
    throw new UsageError(`Invalid --risk ${risk}. Expected one of: ${config.closeout.validRiskTiers.join(", ")}.`);
  }
  if (!config.closeout.validPriorities.includes(priority)) {
    throw new UsageError(`Invalid --priority ${priority}. Expected one of: ${config.closeout.validPriorities.join(", ")}.`);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(skill)) {
    throw new UsageError("--skill must be a repo-local skill name like feature-lifecycle.");
  }
  const availableSkills = installedSkillNames(root, config.skills.roots);
  if (availableSkills.size > 0 && !availableSkills.has(skill)) {
    throw new UsageError(`Unknown --skill ${skill}. Expected one of: ${formatList(availableSkills)}.`);
  }
  for (const [label, value] of [
    ["feature name", name],
    ["--summary", summary],
    ["--owner", owner],
    ["--skill", skill],
    ["--priority", priority],
  ]) {
    assertSingleLine(label, value);
  }
  for (const [label, value] of [
    ["--owner", owner],
    ["--skill", skill],
    ["--priority", priority],
  ]) {
    assertBacktickSafe(label, value);
  }

  const featureRoot = path.join(root, config.closeout.featureRoot);
  const backlogPath = path.join(root, config.closeout.backlogPath);
  const existingDocs = walk(featureRoot, (file) => basenameMatchesFeatureId(file, featureId));
  if (existingDocs.length > 0) {
    throw new UsageError(`Feature ${featureId} already has owner doc(s):\n${existingDocs.map((file) => `- ${file}`).join("\n")}`);
  }

  if (fs.existsSync(backlogPath)) {
    const backlog = fs.readFileSync(backlogPath, "utf8");
    if (backlog.split(/\r?\n/).some((line) => line.startsWith(`| \`${featureId}\``))) {
      throw new UsageError(`Feature ${featureId} already has a backlog row.`);
    }
  }

  const featureRel = toPosixPath(path.join(config.closeout.featureRoot, `${featureId}-${slugify(name)}.md`));
  const featurePath = path.join(root, featureRel);
  const linkTarget = toPosixPath(path.relative(path.dirname(config.closeout.backlogPath), featureRel));
  const backlogRow = `| \`${featureId}\` | ${escapeTableCell(name)} | \`${status}\` | \`${escapeTableCell(priority)}\` | ${escapeTableCell(summary)} | [\`${path.basename(featureRel)}\`](${linkTarget}) |`;
  const docText = featureDocText({
    id: featureId,
    name,
    status,
    risk,
    owner,
    skill,
    backlogPath: config.closeout.backlogPath,
  });

  if (dryRun) {
    console.log(`Would create feature owner doc: ${featurePath}`);
    console.log(`Would update backlog: ${backlogPath}`);
    console.log(backlogRow);
    return;
  }

  preflightWritableFile(featurePath, { mustNotExist: true });
  preflightWritableFile(backlogPath);

  fs.mkdirSync(path.dirname(featurePath), { recursive: true });
  fs.writeFileSync(featurePath, docText);
  fs.mkdirSync(path.dirname(backlogPath), { recursive: true });
  if (!fs.existsSync(backlogPath)) {
    fs.writeFileSync(backlogPath, `${backlogHeader()}\n${backlogRow}\n`);
  } else {
    const current = fs.readFileSync(backlogPath, "utf8");
    fs.writeFileSync(backlogPath, `${current.replace(/\s*$/, "\n")}${backlogRow}\n`);
  }

  console.log(`Created ${featureRel} and indexed ${featureId} in ${config.closeout.backlogPath}`);
}

try {
  if (!command || command === "--help" || command === "-h") {
    usage();
    process.exit(0);
  }

  if (command === "--version" || command === "-v") {
    console.log(packageVersion());
  } else if (command === "init") {
    const options = parseArgs(args, {
      flags: {
        force: { type: "boolean" },
        "dry-run": { type: "boolean" },
      },
    });
    if (options.positionals.length > 1) throw new UsageError(`init accepts one target directory, got: ${options.positionals.join(" ")}`);
    init(options.positionals[0], { force: Boolean(options.flags.force), dryRun: Boolean(options.flags["dry-run"]) });
  } else if (command === "feature") {
    addFeature(args);
  } else if (command === "docs-check") {
    runScript("docs-integrity-check.mjs", args);
  } else if (command === "skills-check") {
    runScript("skills-integrity-check.mjs", args);
  } else if (command === "closeout-check") {
    runScript("agent-closeout-check.mjs", args);
  } else {
    usage();
    process.exit(2);
  }
} catch (error) {
  console.error(error.message);
  process.exit(error.exitCode ?? 1);
}
