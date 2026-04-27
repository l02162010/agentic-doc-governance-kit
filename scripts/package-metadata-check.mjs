#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs, UsageError } from "./lib/args.mjs";

let options;
try {
  options = parseArgs(process.argv.slice(2), {
    aliases: { h: "help" },
    flags: {
      strict: { type: "boolean" },
      package: { type: "string" },
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

if (options.flags.help) {
  console.log("Usage: node scripts/package-metadata-check.mjs [--strict] [--package <package.json>] [--json]");
  process.exit(0);
}
if (options.positionals.length > 0) {
  console.error(`package-metadata-check does not accept positional arguments: ${options.positionals.join(" ")}`);
  process.exit(2);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = path.resolve(options.flags.package ?? path.join(repoRoot, "package.json"));
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const strict = Boolean(options.flags.strict);
const issues = [];

function addIssue(code, severity, field, recommendedFix) {
  issues.push({ code, severity, field, recommendedFix });
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isRepositoryUrl(value) {
  if (value.startsWith("git+")) return isHttpsUrl(value.slice("git+".length));
  return isHttpsUrl(value);
}

function repositoryUrl() {
  if (typeof pkg.repository === "string") return pkg.repository;
  if (pkg.repository && typeof pkg.repository.url === "string") return pkg.repository.url;
  return "";
}

for (const field of ["name", "version", "description", "license"]) {
  if (typeof pkg[field] !== "string" || pkg[field].trim() === "") {
    addIssue("PACKAGE_REQUIRED_FIELD_MISSING", "error", field, `Set package.json ${field}.`);
  }
}

if (!pkg.bin || typeof pkg.bin !== "object" || typeof pkg.bin["agentic-doc-governance"] !== "string") {
  addIssue("PACKAGE_BIN_MISSING", "error", "bin.agentic-doc-governance", "Expose the CLI binary in package.json.");
}
if (!Array.isArray(pkg.files) || !pkg.files.includes("bin") || !pkg.files.includes("scripts") || !pkg.files.includes("templates")) {
  addIssue("PACKAGE_FILES_INCOMPLETE", "error", "files", "Keep bin, scripts, and templates in the published file allowlist.");
}

const publishMetadataSeverity = strict ? "error" : "warning";
const repoUrl = repositoryUrl();
if (!repoUrl) {
  addIssue("PACKAGE_REPOSITORY_MISSING", publishMetadataSeverity, "repository", "Set package.json repository to the canonical public source URL before publishing.");
}
if (repoUrl && !isRepositoryUrl(repoUrl)) {
  addIssue("PACKAGE_REPOSITORY_WEAK", publishMetadataSeverity, "repository", "Use a git+https:// or https:// repository URL.");
}
if (!isHttpUrl(pkg.homepage ?? "")) {
  addIssue("PACKAGE_HOMEPAGE_MISSING", publishMetadataSeverity, "homepage", "Set package.json homepage to the README or project landing page URL before publishing.");
}
if (!isHttpUrl(pkg.bugs?.url ?? "")) {
  addIssue("PACKAGE_BUGS_MISSING", publishMetadataSeverity, "bugs.url", "Set package.json bugs.url to the public issue tracker before publishing.");
}

const report = {
  ok: issues.every((issue) => issue.severity !== "error"),
  strict,
  packagePath,
  issues,
};

if (options.flags.json) console.log(JSON.stringify(report, null, 2));
else if (report.ok) {
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  console.log(`Package metadata check passed with ${warnings} warning(s).`);
  for (const issue of issues) console.log(`- [${issue.severity}] ${issue.code} ${issue.field}: ${issue.recommendedFix}`);
} else {
  console.log(`Package metadata check found ${issues.length} issue(s):`);
  for (const issue of issues) console.log(`- [${issue.severity}] ${issue.code} ${issue.field}: ${issue.recommendedFix}`);
}

process.exit(report.ok ? 0 : 1);
