import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { parseArgs, UsageError } from "./args.mjs";
import { loadGovernanceConfig } from "./config.mjs";
import { isValidFeatureStatus, normalizeFeatureStatus, validFeatureStatusList } from "./feature-lifecycle.mjs";
import { parseMarkdownTableRow } from "./markdown-table.mjs";

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

function findFeatureDocs(featureRoot, featureId) {
  return walk(featureRoot, (file) => basenameMatchesFeatureId(file, featureId));
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

function addFeature(argv, { usage }) {
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

function replaceMetadataValue(text, field, value) {
  const lines = text.split(/\r?\n/);
  const index = lines.findIndex((line) => line.match(new RegExp(`^>\\s*${field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:`)));
  const replacement = `> ${field}: \`${value}\``;
  if (index === -1) return `${replacement}\n${text}`;
  lines[index] = replacement;
  return lines.join("\n");
}

function appendStatusNote(text, status, note) {
  const statusNote = note || `Status updated by \`agentic-doc-governance feature status\`.`;
  const block = [`### ${status}`, "", statusNote, ""].join("\n");
  if (text.includes("\n## Status Notes\n")) return `${text.replace(/\s*$/, "\n\n")}${block}`;
  return `${text.replace(/\s*$/, "\n\n")}## Status Notes\n\n${block}`;
}

function updateBacklogStatusLine(line, featureId, status, backlogPath) {
  if (!line.startsWith(`| \`${featureId}\``)) return { line, matched: false };
  const cells = parseMarkdownTableRow(line);
  if (cells.length < 6) {
    throw new UsageError(`Backlog row for ${featureId} is malformed in ${backlogPath}.`);
  }
  return {
    matched: true,
    line: `| ${cells[0]} | ${escapeTableCell(cells[1])} | \`${status}\` | ${cells[3]} | ${escapeTableCell(cells[4])} | ${cells[5]} |`,
  };
}

function updateBacklogStatus(text, featureId, status, backlogPath) {
  let matches = 0;
  const lines = text.split(/\r?\n/).map((line) => {
    const updated = updateBacklogStatusLine(line, featureId, status, backlogPath);
    if (updated.matched) matches += 1;
    return updated.line;
  });
  if (matches === 0) throw new UsageError(`Feature ${featureId} does not have a backlog row in ${backlogPath}.`);
  if (matches > 1) throw new UsageError(`Feature ${featureId} has multiple backlog rows in ${backlogPath}.`);
  return lines.join("\n");
}

function writeTempText(root, relPath, text) {
  const target = path.join(root, relPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
}

function assertProposedCloseoutPasses({ root, config, kitRoot, featureId, featurePath, backlogPath, nextDoc, nextBacklog }) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "adgk-closeout-"));
  try {
    const configPath = path.join(root, ".agentic-doc-governance.json");
    if (fs.existsSync(configPath)) {
      fs.copyFileSync(configPath, path.join(tempRoot, ".agentic-doc-governance.json"));
    }
    for (const docRoot of config.docs.roots) {
      fs.mkdirSync(path.join(tempRoot, docRoot), { recursive: true });
    }
    writeTempText(tempRoot, path.relative(root, featurePath), nextDoc);
    writeTempText(tempRoot, path.relative(root, backlogPath), nextBacklog);

    const result = spawnSync(process.execPath, [
      path.join(kitRoot, "scripts", "agent-closeout-check.mjs"),
      "--root",
      tempRoot,
      "--feature",
      featureId,
      "--json",
    ], { encoding: "utf8" });
    if (result.status === 0) return;

    let detail = result.stderr || result.stdout;
    try {
      const report = JSON.parse(result.stdout);
      detail = report.issues.map((item) => `${item.code}: ${JSON.stringify(item.observed)}`).join("\n");
    } catch {
      // Keep the raw checker output when it is not JSON.
    }
    throw new Error(`Refusing to mark ${featureId} as SHIPPED because closeout check would fail:\n${detail}`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function updateFeatureStatus(argv, { kitRoot, usage }) {
  const options = parseArgs(argv.slice(1), {
    aliases: { h: "help" },
    flags: {
      root: { type: "string" },
      to: { type: "string" },
      note: { type: "string" },
      "dry-run": { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  if (options.flags.help) {
    usage();
    process.exit(0);
  }

  const [featureId] = options.positionals;
  if (options.positionals.length !== 1 || !/^FEAT-\d+$/.test(featureId ?? "")) {
    throw new UsageError("feature status requires exactly one feature ID like FEAT-002.");
  }
  const status = normalizeFeatureStatus(options.flags.to);
  if (!status) throw new UsageError("feature status requires --to <status>.");
  if (!isValidFeatureStatus(status)) {
    throw new UsageError(`Invalid --to ${status}. Expected one of: ${validFeatureStatusList()}.`);
  }
  const note = options.flags.note;
  if (note) assertSingleLine("--note", note);

  const root = path.resolve(options.flags.root ?? process.cwd());
  const config = loadGovernanceConfig(root);
  const featureRoot = path.join(root, config.closeout.featureRoot);
  const backlogPath = path.join(root, config.closeout.backlogPath);
  const featureDocs = findFeatureDocs(featureRoot, featureId);
  if (featureDocs.length === 0) throw new UsageError(`Feature ${featureId} does not have an owner doc in ${featureRoot}.`);
  if (featureDocs.length > 1) {
    throw new UsageError(`Feature ${featureId} has multiple owner docs:\n${featureDocs.map((file) => `- ${file}`).join("\n")}`);
  }
  if (!fs.existsSync(backlogPath)) throw new UsageError(`Feature ${featureId} cannot be updated because backlog is missing: ${backlogPath}`);

  const featurePath = featureDocs[0];
  const currentDoc = fs.readFileSync(featurePath, "utf8");
  const currentBacklog = fs.readFileSync(backlogPath, "utf8");
  const nextDoc = appendStatusNote(replaceMetadataValue(currentDoc, "Status", status), status, note);
  const nextBacklog = updateBacklogStatus(currentBacklog, featureId, status, backlogPath);
  const dryRun = Boolean(options.flags["dry-run"]);
  const json = Boolean(options.flags.json);
  const report = {
    ok: true,
    featureId,
    status,
    featurePath,
    backlogPath,
    dryRun,
  };

  if (dryRun) {
    if (json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`Would set ${featureId} to ${status}`);
      console.log(`- ${featurePath}`);
      console.log(`- ${backlogPath}`);
    }
    return;
  }

  preflightWritableFile(featurePath);
  preflightWritableFile(backlogPath);
  if (status === "SHIPPED") {
    assertProposedCloseoutPasses({
      root,
      config,
      kitRoot,
      featureId,
      featurePath,
      backlogPath,
      nextDoc,
      nextBacklog,
    });
  }
  fs.writeFileSync(featurePath, nextDoc);
  fs.writeFileSync(backlogPath, nextBacklog);

  if (json) console.log(JSON.stringify(report, null, 2));
  else console.log(`Set ${featureId} to ${status} in owner doc and backlog.`);
}

export function featureCommand(args, { kitRoot, usage }) {
  if (args[0] === "add") addFeature(args, { usage });
  else if (args[0] === "status") updateFeatureStatus(args, { kitRoot, usage });
  else {
    usage();
    process.exit(2);
  }
}
