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
  agentic-doc-governance docs-check [--root <dir>]
  agentic-doc-governance skills-check [--root <dir>]
  agentic-doc-governance closeout-check --feature FEAT-xxx [--root <dir>]
`);
}

function valueFor(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

function runScript(script, extraArgs) {
  const result = spawnSync(process.execPath, [path.join(KIT_ROOT, "scripts", script), ...extraArgs], {
    stdio: "inherit",
  });
  process.exit(result.status ?? 1);
}

function copyFile(source, target, force) {
  if (fs.existsSync(target) && !force) {
    throw new Error(`Refusing to overwrite ${target}. Re-run with --force if intentional.`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyDir(sourceDir, targetDir, force) {
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const source = path.join(sourceDir, entry.name);
    const target = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(source, target, force);
    } else {
      copyFile(source, target, force);
    }
  }
}

function init(targetDir, force) {
  if (!targetDir) {
    usage();
    process.exit(2);
  }

  const target = path.resolve(targetDir);
  fs.mkdirSync(target, { recursive: true });

  copyFile(path.join(KIT_ROOT, "AGENTS.template.md"), path.join(target, "AGENTS.md"), force);
  copyDir(path.join(KIT_ROOT, "templates"), target, force);
  copyDir(path.join(KIT_ROOT, "scripts"), path.join(target, "scripts"), force);

  console.log(`Agentic Doc Governance Kit installed into ${target}`);
}

if (!command || command === "--help" || command === "-h") {
  usage();
  process.exit(0);
}

if (command === "init") {
  init(args[0], args.includes("--force"));
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
