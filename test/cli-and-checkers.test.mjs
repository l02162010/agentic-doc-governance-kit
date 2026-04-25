import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(repoRoot, "bin", "agentic-doc-governance.mjs");

function run(args, options = {}) {
  return spawnSync(process.execPath, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
  });
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "adgk-test-"));
}

function parseJson(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test("init installs a self-checking governance footprint", () => {
  const target = path.join(tempDir(), "product");

  const init = run([cli, "init", target]);
  assert.equal(init.status, 0, init.stderr);
  assert.match(init.stdout, /installed into/);

  for (const requiredPath of [
    ".agentic-doc-governance.json",
    "AGENTS.md",
    "docs/canonical/agent-execution-contract.md",
    ".codex/skills/feature-lifecycle/SKILL.md",
    "scripts/lib/config.mjs",
  ]) {
    assert.equal(fs.existsSync(path.join(target, requiredPath)), true, requiredPath);
  }

  assert.equal(run([cli, "docs-check", "--root", target, "--check-generated"]).status, 0);
  assert.equal(run([cli, "skills-check", "--root", target]).status, 0);
});

test("version command returns package version", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const result = run([cli, "--version"]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), pkg.version);
});

test("init preflights conflicts before writing partial output", () => {
  const target = path.join(tempDir(), "product");
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "AGENTS.md"), "# Existing\n");

  const result = run([cli, "init", target]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Refusing to overwrite existing files/);
  assert.equal(fs.existsSync(path.join(target, "docs")), false);
});

test("init preflights file conflicts on parent path segments", () => {
  const target = path.join(tempDir(), "product");
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "docs"), "blocking file\n");

  const result = run([cli, "init", target]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Refusing to overwrite existing files/);
  assert.match(result.stderr, /docs/);
  assert.equal(fs.existsSync(path.join(target, "AGENTS.md")), false);
});

test("init force still preflights impossible parent path conflicts", () => {
  const target = path.join(tempDir(), "product");
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "scripts"), "blocking file\n");

  const result = run([cli, "init", target, "--force"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Refusing to overwrite existing files/);
  assert.match(result.stderr, /scripts/);
  assert.equal(fs.existsSync(path.join(target, "AGENTS.md")), false);
});

test("init dry-run reports files without creating the target", () => {
  const target = path.join(tempDir(), "dry-run-product");

  const result = run([cli, "init", target, "--dry-run"]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Would install/);
  assert.equal(fs.existsSync(target), false);
});

test("generated check reports missing managed files", () => {
  const target = path.join(tempDir(), "product");
  assert.equal(run([cli, "init", target]).status, 0);
  fs.rmSync(path.join(target, "scripts", "lib", "config.mjs"));

  const result = run([
    path.join(repoRoot, "scripts", "docs-integrity-check.mjs"),
    "--root",
    target,
    "--check-generated",
    "--json",
  ]);

  assert.notEqual(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.issues.some((issue) => issue.code === "GENERATED_PATH_MISSING"), true);
});

test("docs check reports malformed local links instead of crashing", () => {
  const target = tempDir();
  fs.mkdirSync(path.join(target, "docs"), { recursive: true });
  fs.writeFileSync(
    path.join(target, ".agentic-doc-governance.json"),
    JSON.stringify({ docs: { roots: ["docs"] }, generated: { requiredPaths: [] } }),
  );
  fs.writeFileSync(path.join(target, "docs", "README.md"), "[bad](%not-valid)\n");

  const result = run([
    path.join(repoRoot, "scripts", "docs-integrity-check.mjs"),
    "--root",
    target,
    "--json",
  ]);

  assert.notEqual(result.status, 0);
  assert.equal(
    JSON.parse(result.stdout).issues.some((issue) => issue.code === "MALFORMED_INTERNAL_LINK"),
    true,
  );
});

test("docs check reports malformed backlog links instead of crashing", () => {
  const target = tempDir();
  fs.mkdirSync(path.join(target, "docs", "canonical", "features"), { recursive: true });
  fs.writeFileSync(
    path.join(target, ".agentic-doc-governance.json"),
    JSON.stringify({ docs: { roots: ["docs"] }, generated: { requiredPaths: [] } }),
  );
  fs.writeFileSync(
    path.join(target, "docs", "canonical", "active-backlog.md"),
    [
      "# Active Backlog",
      "",
      "| ID | Feature | Status | Priority | Summary | Primary doc |",
      "|---|---|---|---|---|---|",
      "| `FEAT-001` | Example | `PLANNED` | `P1` | Example | [bad](%not-valid) |",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(target, "docs", "canonical", "features", "FEAT-001-example.md"),
    [
      "> Status: `PLANNED`",
      "> Risk tier: `T3`",
      "",
      "# FEAT-001 - Example",
      "",
    ].join("\n"),
  );

  const result = run([
    path.join(repoRoot, "scripts", "docs-integrity-check.mjs"),
    "--root",
    target,
    "--json",
  ]);

  assert.notEqual(result.status, 0);
  assert.equal(
    JSON.parse(result.stdout).issues.some((issue) => issue.code === "MALFORMED_INTERNAL_LINK"),
    true,
  );
});

test("docs check uses configured feature root and backlog path", () => {
  const target = tempDir();
  fs.mkdirSync(path.join(target, "governance", "features"), { recursive: true });
  fs.writeFileSync(
    path.join(target, ".agentic-doc-governance.json"),
    JSON.stringify({
      docs: { roots: ["governance"] },
      generated: { requiredPaths: [] },
      closeout: {
        backlogPath: "governance/backlog.md",
        featureRoot: "governance/features",
      },
    }),
  );
  fs.writeFileSync(
    path.join(target, "governance", "backlog.md"),
    [
      "# Backlog",
      "",
      "| ID | Feature | Status | Priority | Summary | Primary doc |",
      "|---|---|---|---|---|---|",
      "| `FEAT-001` | Example | `VERIFYING` | `P1` | Example | [doc](features/FEAT-001-example.md) |",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(target, "governance", "features", "FEAT-001-example.md"),
    [
      "> Status: `PLANNED`",
      "> Risk tier: `T3`",
      "",
      "# FEAT-001 - Example",
      "",
    ].join("\n"),
  );

  const result = run([
    path.join(repoRoot, "scripts", "docs-integrity-check.mjs"),
    "--root",
    target,
    "--json",
  ]);

  assert.notEqual(result.status, 0);
  assert.equal(
    JSON.parse(result.stdout).issues.some((issue) => issue.code === "FEAT_STATUS_MISMATCH"),
    true,
  );
});

test("closeout check rejects shipped unchecked acceptance without waiver", () => {
  const target = path.join(tempDir(), "product");
  assert.equal(run([cli, "init", target]).status, 0);
  const featurePath = path.join(target, "docs", "canonical", "features", "FEAT-001-example-feature.md");
  let text = fs.readFileSync(featurePath, "utf8");
  text = text
    .replace("> Status: `PLANNED`", "> Status: `SHIPPED`")
    .replace("- **Acceptance waivers**:", "- **Acceptance waivers**: none");
  fs.writeFileSync(featurePath, text);

  const backlogPath = path.join(target, "docs", "canonical", "active-backlog.md");
  fs.writeFileSync(
    backlogPath,
    fs.readFileSync(backlogPath, "utf8").replace("| `PLANNED` |", "| `SHIPPED` |"),
  );

  const report = run([
    path.join(repoRoot, "scripts", "agent-closeout-check.mjs"),
    "--root",
    target,
    "--feature",
    "FEAT-001",
    "--json",
  ]);

  assert.notEqual(report.status, 0);
  assert.equal(
    JSON.parse(report.stdout).issues.some((issue) => issue.code === "SHIPPED_ACCEPTANCE_INCOMPLETE"),
    true,
  );
});

test("checker json output is machine readable on success", () => {
  const report = parseJson(run([
    path.join(repoRoot, "scripts", "docs-integrity-check.mjs"),
    "--check-generated",
    "--json",
  ]));

  assert.equal(report.ok, true);
  assert.equal(Array.isArray(report.issues), true);
});
