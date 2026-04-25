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

test("checkers reject unknown options and missing flag values", () => {
  const unknown = run([path.join(repoRoot, "scripts", "docs-integrity-check.mjs"), "--wat"]);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /Unknown option --wat/);
  assert.doesNotMatch(unknown.stderr, /UsageError|at /);

  const missingValue = run([path.join(repoRoot, "scripts", "agent-closeout-check.mjs"), "--root", "--json"]);
  assert.equal(missingValue.status, 2);
  assert.match(missingValue.stderr, /Missing value for --root/);
  assert.doesNotMatch(missingValue.stderr, /UsageError|at /);
});

test("feature add creates a traceable owner doc and backlog row", () => {
  const target = path.join(tempDir(), "product");
  assert.equal(run([cli, "init", target]).status, 0);

  const result = run([
    cli,
    "feature",
    "add",
    "FEAT-002",
    "Team Dashboard",
    "--root",
    target,
    "--risk",
    "T2",
    "--summary",
    "Show team status at a glance.",
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    fs.existsSync(path.join(target, "docs", "canonical", "features", "FEAT-002-team-dashboard.md")),
    true,
  );
  assert.match(
    fs.readFileSync(path.join(target, "docs", "canonical", "active-backlog.md"), "utf8"),
    /\| `FEAT-002` \| Team Dashboard \| `IDEA` \| `P2` \| Show team status at a glance\. \| \[`FEAT-002-team-dashboard\.md`\]\(features\/FEAT-002-team-dashboard\.md\) \|/,
  );
  assert.equal(run([cli, "docs-check", "--root", target, "--check-generated"]).status, 0);
});

test("feature add preflights backlog path before creating owner doc", () => {
  const target = tempDir();
  fs.writeFileSync(
    path.join(target, ".agentic-doc-governance.json"),
    JSON.stringify({
      docs: { roots: ["docs"] },
      skills: { roots: [] },
      generated: { requiredPaths: [] },
      closeout: {
        backlogPath: "governance/backlog.md",
        featureRoot: "docs/canonical/features",
      },
    }),
  );
  fs.writeFileSync(path.join(target, "governance"), "blocking file\n");

  const result = run([
    cli,
    "feature",
    "add",
    "FEAT-777",
    "Blocked Backlog",
    "--root",
    target,
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /parent path is a file/);
  assert.equal(
    fs.existsSync(path.join(target, "docs", "canonical", "features", "FEAT-777-blocked-backlog.md")),
    false,
  );
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

test("docs check reports duplicate feature owner docs", () => {
  const target = path.join(tempDir(), "product");
  assert.equal(run([cli, "init", target]).status, 0);
  fs.copyFileSync(
    path.join(target, "docs", "canonical", "features", "FEAT-001-example-feature.md"),
    path.join(target, "docs", "canonical", "features", "FEAT-001-duplicate.md"),
  );

  const result = run([
    path.join(repoRoot, "scripts", "docs-integrity-check.mjs"),
    "--root",
    target,
    "--json",
  ]);

  assert.notEqual(result.status, 0);
  assert.equal(
    JSON.parse(result.stdout).issues.some((issue) => issue.code === "FEAT_OWNER_DUPLICATE"),
    true,
  );
});

test("docs check reports backlog primary doc mismatch", () => {
  const target = path.join(tempDir(), "product");
  assert.equal(run([cli, "init", target]).status, 0);
  const backlogPath = path.join(target, "docs", "canonical", "active-backlog.md");
  fs.writeFileSync(
    backlogPath,
    fs.readFileSync(backlogPath, "utf8").replace("features/FEAT-001-example-feature.md", "features/feature-template.md"),
  );

  const result = run([
    path.join(repoRoot, "scripts", "docs-integrity-check.mjs"),
    "--root",
    target,
    "--json",
  ]);

  assert.notEqual(result.status, 0);
  assert.equal(
    JSON.parse(result.stdout).issues.some((issue) => issue.code === "FEAT_BACKLOG_DOC_MISMATCH"),
    true,
  );
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
  const issues = JSON.parse(result.stdout).issues;
  assert.equal(issues.some((issue) => issue.code === "MALFORMED_INTERNAL_LINK"), true);
  assert.equal(issues.some((issue) => issue.code === "FEAT_BACKLOG_DOC_MISMATCH"), false);
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

test("docs check rejects local links that escape the configured root", () => {
  const target = tempDir();
  fs.mkdirSync(path.join(target, "docs"), { recursive: true });
  fs.writeFileSync(
    path.join(target, ".agentic-doc-governance.json"),
    JSON.stringify({ docs: { roots: ["docs"] }, generated: { requiredPaths: [] } }),
  );
  fs.writeFileSync(path.join(target, "docs", "README.md"), "[escape](../../outside.md)\n");

  const result = run([
    path.join(repoRoot, "scripts", "docs-integrity-check.mjs"),
    "--root",
    target,
    "--json",
  ]);

  assert.notEqual(result.status, 0);
  assert.equal(
    JSON.parse(result.stdout).issues.some((issue) => issue.code === "INTERNAL_LINK_OUTSIDE_ROOT"),
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

test("closeout check rejects shipped manifest fields left empty", () => {
  const target = path.join(tempDir(), "product");
  assert.equal(run([cli, "init", target]).status, 0);
  const featurePath = path.join(target, "docs", "canonical", "features", "FEAT-001-example-feature.md");
  let text = fs.readFileSync(featurePath, "utf8");
  text = text
    .replace("> Status: `PLANNED`", "> Status: `SHIPPED`")
    .replace("- [ ] Replace this template with real acceptance criteria.", "- [x] Replace this template with real acceptance criteria.")
    .replace(
      "## Linked Artifacts",
      [
        "## Closeout Manifest",
        "",
        "- **Runtime contract**: ",
        "- **Verification**: TBD",
        "- **Legal outcome**: none",
        "- **AI outcome**: none",
        "- **Runbook outcome**: none",
        "- **Release outcome**: none",
        "- **Semantic review**: reviewed",
        "- **Acceptance waivers**: none",
        "- **Residual risks**: none",
        "",
        "## Linked Artifacts",
      ].join("\n"),
    );
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
  const issues = JSON.parse(report.stdout).issues;
  assert.equal(issues.some((issue) => issue.code === "CLOSEOUT_FIELD_EMPTY" && issue.observed.field === "runtime contract"), true);
  assert.equal(issues.some((issue) => issue.code === "CLOSEOUT_FIELD_EMPTY" && issue.observed.field === "verification"), true);
});

test("closeout check rejects backlog primary doc links that escape the configured root", () => {
  const target = path.join(tempDir(), "product");
  assert.equal(run([cli, "init", target]).status, 0);
  const backlogPath = path.join(target, "docs", "canonical", "active-backlog.md");
  fs.writeFileSync(
    backlogPath,
    fs.readFileSync(backlogPath, "utf8").replace("features/FEAT-001-example-feature.md", "../../../outside.md"),
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
    JSON.parse(report.stdout).issues.some((issue) => issue.code === "INTERNAL_LINK_OUTSIDE_ROOT"),
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

test("closeout check refuses duplicate feature owner docs", () => {
  const target = path.join(tempDir(), "product");
  assert.equal(run([cli, "init", target]).status, 0);
  fs.copyFileSync(
    path.join(target, "docs", "canonical", "features", "FEAT-001-example-feature.md"),
    path.join(target, "docs", "canonical", "features", "FEAT-001-parallel.md"),
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
    JSON.parse(report.stdout).issues.some((issue) => issue.code === "FEAT_OWNER_DUPLICATE"),
    true,
  );
});

test("closeout check reports backlog primary doc mismatch", () => {
  const target = path.join(tempDir(), "product");
  assert.equal(run([cli, "init", target]).status, 0);
  const backlogPath = path.join(target, "docs", "canonical", "active-backlog.md");
  fs.writeFileSync(
    backlogPath,
    fs.readFileSync(backlogPath, "utf8").replace("features/FEAT-001-example-feature.md", "features/feature-template.md"),
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
    JSON.parse(report.stdout).issues.some((issue) => issue.code === "FEAT_BACKLOG_DOC_MISMATCH"),
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
