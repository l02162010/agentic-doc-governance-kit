#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2];
const args = process.argv.slice(3);

function usage() {
  console.log(`Usage:
  agentic-doc-governance init <target-dir> [--force]
  agentic-doc-governance init <target-dir> [--dry-run]
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

try {
  if (!command || command === "--help" || command === "-h") {
    usage();
    process.exit(0);
  }

  if (command === "--version" || command === "-v") {
    console.log(packageVersion());
  } else if (command === "init") {
    init(args[0], { force: args.includes("--force"), dryRun: args.includes("--dry-run") });
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
  process.exit(1);
}
