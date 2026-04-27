import fs from "node:fs";
import path from "node:path";
import { UsageError } from "./args.mjs";

function collectFiles(sourceDir, targetDir, predicate = () => true) {
  const files = [];
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const source = path.join(sourceDir, entry.name);
    const target = path.join(targetDir, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(source, target, predicate));
    else if (predicate(source)) files.push({ source, target });
  }
  return files;
}

function installFiles(kitRoot, target) {
  return [
    {
      source: path.join(kitRoot, "AGENTS.template.md"),
      target: path.join(target, "AGENTS.md"),
    },
    ...collectFiles(path.join(kitRoot, "templates"), target),
    ...collectFiles(path.join(kitRoot, "scripts"), path.join(target, "scripts"), (source) => path.basename(source) !== "package-metadata-check.mjs"),
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

function backupPath(target) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${target}.bak-${stamp}`;
}

function copyFile(source, target, { backup = false } = {}) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (backup && fs.existsSync(target) && !fs.statSync(target).isDirectory()) {
    fs.copyFileSync(target, backupPath(target));
  }
  fs.copyFileSync(source, target);
}

export function initCommand(targetDir, { kitRoot, force, backup, dryRun, json, usage }) {
  if (!targetDir) {
    usage();
    process.exit(2);
  }
  if (backup && !force) {
    throw new UsageError("init --backup requires --force so overwrite intent is explicit.");
  }

  const target = path.resolve(targetDir);
  const files = installFiles(kitRoot, target);
  preflight(files, force);

  if (dryRun) {
    const report = {
      ok: true,
      target,
      force,
      backup,
      files: files.map(({ target: file }) => ({
        path: file,
        action: fs.existsSync(file) ? "overwrite" : "create",
      })),
    };
    if (json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`Would install Agentic Doc Governance Kit into ${target}`);
      for (const file of report.files) console.log(`- ${file.action}: ${file.path}`);
    }
    return;
  }

  fs.mkdirSync(target, { recursive: true });
  for (const file of files) copyFile(file.source, file.target, { backup });

  const report = { ok: true, target, force, backup, files: files.map(({ target: file }) => file) };
  if (json) console.log(JSON.stringify(report, null, 2));
  else console.log(`Agentic Doc Governance Kit installed into ${target}`);
}
