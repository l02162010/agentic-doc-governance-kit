#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs, UsageError } from "../scripts/lib/args.mjs";
import { featureCommand } from "../scripts/lib/cli-feature.mjs";
import { initCommand } from "../scripts/lib/cli-init.mjs";

const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2];
const args = process.argv.slice(3);

function usage() {
  console.log(`Usage:
  agentic-doc-governance init <target-dir> [--force]
  agentic-doc-governance init <target-dir> [--dry-run] [--json]
  agentic-doc-governance init <target-dir> --force --backup
  agentic-doc-governance feature add FEAT-xxx <name> [--root <dir>] [--status IDEA] [--risk T2] [--priority P2] [--summary <text>] [--dry-run]
  agentic-doc-governance feature status FEAT-xxx --to <status> [--root <dir>] [--note <text>] [--dry-run] [--json]
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
        backup: { type: "boolean" },
        "dry-run": { type: "boolean" },
        json: { type: "boolean" },
      },
    });
    if (options.positionals.length > 1) throw new UsageError(`init accepts one target directory, got: ${options.positionals.join(" ")}`);
    initCommand(options.positionals[0], {
      kitRoot: KIT_ROOT,
      force: Boolean(options.flags.force),
      backup: Boolean(options.flags.backup),
      dryRun: Boolean(options.flags["dry-run"]),
      json: Boolean(options.flags.json),
      usage,
    });
  } else if (command === "feature") {
    featureCommand(args, { kitRoot: KIT_ROOT, usage });
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
