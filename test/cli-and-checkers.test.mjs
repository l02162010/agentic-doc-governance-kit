import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { writeTextFilesWithRollback } from "../scripts/lib/cli-feature.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(repoRoot, "bin", "agentic-doc-governance.mjs");

function run(args, options = {}) {
  return spawnSync(process.execPath, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
  });
}

function runCommand(command, args, options = {}) {
  return spawnSync(command, args, {
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

function addFeatureSmoke(cliPath, target, feature) {
  const result = run([
    cliPath,
    "feature",
    "add",
    feature.id,
    feature.name,
    "--root",
    target,
    "--status",
    feature.status,
    "--risk",
    feature.risk,
    "--priority",
    feature.priority,
    "--summary",
    feature.summary,
    "--owner",
    feature.owner,
    "--skill",
    feature.skill,
  ]);
  assert.equal(result.status, 0, result.stderr);
}

function packAndInstallPackage(workspace) {
  const packDir = path.join(workspace, "pack");
  const installDir = path.join(workspace, "install");
  fs.mkdirSync(packDir, { recursive: true });
  fs.mkdirSync(installDir, { recursive: true });

  const pack = runCommand("npm", ["pack", "--ignore-scripts", "--dry-run=false", "--pack-destination", packDir, "--json"]);
  assert.equal(pack.status, 0, pack.stderr);

  const [packed] = JSON.parse(pack.stdout);
  const tarball = path.join(packDir, packed.filename);
  const install = runCommand("npm", ["install", "--ignore-scripts", "--dry-run=false", "--prefix", installDir, tarball]);
  assert.equal(install.status, 0, install.stderr);

  return {
    files: new Set(packed.files.map((file) => file.path)),
    cliPath: path.join(installDir, "node_modules", "agentic-doc-governance-kit", "bin", "agentic-doc-governance.mjs"),
  };
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
    "scripts/lib/cli-feature.mjs",
    "scripts/lib/cli-init.mjs",
    "scripts/lib/config.mjs",
    "scripts/lib/markdown-table.mjs",
  ]) {
    assert.equal(fs.existsSync(path.join(target, requiredPath)), true, requiredPath);
  }
  assert.equal(fs.existsSync(path.join(target, "scripts", "package-metadata-check.mjs")), false);

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

test("init dry-run json exposes the write plan", () => {
  const target = path.join(tempDir(), "json-dry-run-product");

  const report = parseJson(run([cli, "init", target, "--dry-run", "--json"]));

  assert.equal(report.ok, true);
  assert.equal(report.target, target);
  assert.equal(report.files.some((file) => file.path.endsWith("AGENTS.md") && file.action === "create"), true);
  assert.equal(fs.existsSync(target), false);
});

test("init force can backup overwritten files", () => {
  const target = path.join(tempDir(), "product");
  assert.equal(run([cli, "init", target]).status, 0);
  fs.writeFileSync(path.join(target, "AGENTS.md"), "# Local changes\n");

  const result = run([cli, "init", target, "--force", "--backup"]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    fs.readdirSync(target).some((name) => name.startsWith("AGENTS.md.bak-")),
    true,
  );
  assert.match(fs.readFileSync(path.join(target, "AGENTS.md"), "utf8"), /# AGENTS\.md/);
});

test("init backup requires explicit force", () => {
  const target = path.join(tempDir(), "product");

  const result = run([cli, "init", target, "--backup"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /--backup requires --force/);
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

test("skills check reports configured skill roots that do not exist", () => {
  const target = tempDir();
  fs.writeFileSync(
    path.join(target, ".agentic-doc-governance.json"),
    JSON.stringify({ skills: { roots: [".codex/skills"] } }),
  );

  const result = run([
    path.join(repoRoot, "scripts", "skills-integrity-check.mjs"),
    "--root",
    target,
    "--json",
  ]);

  assert.notEqual(result.status, 0);
  assert.equal(
    JSON.parse(result.stdout).issues.some((issue) => issue.code === "SKILL_ROOT_MISSING"),
    true,
  );
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
  assert.equal(run([cli, "closeout-check", "--root", target, "--feature", "FEAT-002"]).status, 0);
});

test("feature add and checkers handle escaped pipe characters in backlog cells", () => {
  const target = path.join(tempDir(), "product");
  assert.equal(run([cli, "init", target]).status, 0);

  const result = run([
    cli,
    "feature",
    "add",
    "FEAT-003",
    "Team | Dashboard",
    "--root",
    target,
    "--risk",
    "T3",
    "--summary",
    "Show status | trends.",
  ]);

  assert.equal(result.status, 0, result.stderr);

  const backlog = fs.readFileSync(path.join(target, "docs", "canonical", "active-backlog.md"), "utf8");
  assert.match(backlog, /Team \\\| Dashboard/);
  assert.match(backlog, /Show status \\\| trends\./);
  assert.equal(run([cli, "docs-check", "--root", target, "--check-generated"]).status, 0);
  assert.equal(run([cli, "closeout-check", "--root", target, "--feature", "FEAT-003"]).status, 0);
});

test("feature status updates owner doc and backlog together", () => {
  const target = path.join(tempDir(), "product");
  assert.equal(run([cli, "init", target]).status, 0);

  const result = run([
    cli,
    "feature",
    "status",
    "FEAT-001",
    "--root",
    target,
    "--to",
    "VERIFYING",
    "--note",
    "Ready for verification.",
  ]);

  assert.equal(result.status, 0, result.stderr);
  const featureText = fs.readFileSync(path.join(target, "docs", "canonical", "features", "FEAT-001-example-feature.md"), "utf8");
  assert.match(featureText, /> Status: `VERIFYING`/);
  assert.match(featureText, /Ready for verification\./);
  assert.match(
    fs.readFileSync(path.join(target, "docs", "canonical", "active-backlog.md"), "utf8"),
    /\| `FEAT-001` \| Example Feature \| `VERIFYING` \| `P1` \|/,
  );
  assert.equal(run([cli, "docs-check", "--root", target, "--check-generated"]).status, 0);
});

test("feature status dry-run json does not modify files", () => {
  const target = path.join(tempDir(), "product");
  assert.equal(run([cli, "init", target]).status, 0);
  const featurePath = path.join(target, "docs", "canonical", "features", "FEAT-001-example-feature.md");
  const before = fs.readFileSync(featurePath, "utf8");

  const report = parseJson(run([
    cli,
    "feature",
    "status",
    "FEAT-001",
    "--root",
    target,
    "--to",
    "VERIFYING",
    "--dry-run",
    "--json",
  ]));

  assert.equal(report.status, "VERIFYING");
  assert.equal(report.dryRun, true);
  assert.equal(fs.readFileSync(featurePath, "utf8"), before);
});

test("feature status refuses shipped transition when closeout would fail", () => {
  const target = path.join(tempDir(), "product");
  assert.equal(run([cli, "init", target]).status, 0);
  const featurePath = path.join(target, "docs", "canonical", "features", "FEAT-001-example-feature.md");
  const backlogPath = path.join(target, "docs", "canonical", "active-backlog.md");

  const result = run([
    cli,
    "feature",
    "status",
    "FEAT-001",
    "--root",
    target,
    "--to",
    "SHIPPED",
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /closeout check would fail/);
  assert.match(result.stderr, /SHIPPED_ACCEPTANCE_INCOMPLETE/);
  assert.match(fs.readFileSync(featurePath, "utf8"), /> Status: `PLANNED`/);
  assert.match(
    fs.readFileSync(backlogPath, "utf8"),
    /\| `FEAT-001` \| Example Feature \| `PLANNED` \| `P1` \|/,
  );
});

test("feature status dry-run refuses shipped transition when closeout would fail", () => {
  const target = path.join(tempDir(), "product");
  assert.equal(run([cli, "init", target]).status, 0);

  const result = run([
    cli,
    "feature",
    "status",
    "FEAT-001",
    "--root",
    target,
    "--to",
    "SHIPPED",
    "--dry-run",
    "--json",
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /closeout check would fail/);
  assert.match(result.stderr, /SHIPPED_ACCEPTANCE_INCOMPLETE/);
});

test("smoke: initialized project supports multiple feature additions and checker wrappers", () => {
  const target = path.join(tempDir(), "product");
  assert.equal(run([cli, "init", target]).status, 0);

  const features = [
    {
      id: "FEAT-010",
      name: "Billing Export",
      status: "PLANNED",
      risk: "T1",
      priority: "P0",
      summary: "Export billing records for finance review.",
      owner: "platform",
      skill: "implementation-surface",
    },
    {
      id: "FEAT-011",
      name: "Workspace Invitations",
      status: "IN_PROGRESS",
      risk: "T2",
      priority: "P1",
      summary: "Invite teammates and track pending access.",
      owner: "product",
      skill: "feature-lifecycle",
    },
    {
      id: "FEAT-012",
      name: "Copy Polish",
      status: "IDEA",
      risk: "T3",
      priority: "P3",
      summary: "Tighten empty state text.",
      owner: "docs",
      skill: "feature-readiness",
    },
  ];

  for (const feature of features) addFeatureSmoke(cli, target, feature);

  const docsReport = parseJson(run([cli, "docs-check", "--root", target, "--check-generated", "--json"]));
  assert.equal(docsReport.ok, true);
  const skillsReport = parseJson(run([cli, "skills-check", "--root", target, "--json"]));
  assert.equal(skillsReport.ok, true);
  const closeoutReport = parseJson(run([cli, "closeout-check", "--root", target, "--feature", "FEAT-012", "--json"]));
  assert.equal(closeoutReport.ok, true);

  const backlog = fs.readFileSync(path.join(target, "docs", "canonical", "active-backlog.md"), "utf8");
  for (const feature of features) assert.match(backlog, new RegExp(`\\| \`${feature.id}\` \\|`));
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

test("feature add rejects terminal statuses, invalid priorities, and unknown skills", () => {
  const target = path.join(tempDir(), "product");
  assert.equal(run([cli, "init", target]).status, 0);

  const shipped = run([
    cli,
    "feature",
    "add",
    "FEAT-777",
    "Already Shipped",
    "--root",
    target,
    "--status",
    "SHIPPED",
  ]);
  assert.notEqual(shipped.status, 0);
  assert.match(shipped.stderr, /cannot create a feature directly in terminal status SHIPPED/);

  const badPriority = run([
    cli,
    "feature",
    "add",
    "FEAT-778",
    "Bad Priority",
    "--root",
    target,
    "--priority",
    "P9",
  ]);
  assert.notEqual(badPriority.status, 0);
  assert.match(badPriority.stderr, /Invalid --priority P9/);

  const badSkill = run([
    cli,
    "feature",
    "add",
    "FEAT-779",
    "Bad Skill",
    "--root",
    target,
    "--skill",
    "missing-skill",
  ]);
  assert.notEqual(badSkill.status, 0);
  assert.match(badSkill.stderr, /Unknown --skill missing-skill/);
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

test("docs check reports configured docs roots that do not exist", () => {
  const target = tempDir();
  fs.writeFileSync(
    path.join(target, ".agentic-doc-governance.json"),
    JSON.stringify({ docs: { roots: ["docs"] }, generated: { requiredPaths: [] } }),
  );

  const result = run([
    path.join(repoRoot, "scripts", "docs-integrity-check.mjs"),
    "--root",
    target,
    "--json",
  ]);

  assert.notEqual(result.status, 0);
  assert.equal(
    JSON.parse(result.stdout).issues.some((issue) => issue.code === "DOC_ROOT_MISSING"),
    true,
  );
});

test("docs check reports feature owner docs without a configured backlog", () => {
  const target = tempDir();
  fs.mkdirSync(path.join(target, "docs", "canonical", "features"), { recursive: true });
  fs.writeFileSync(
    path.join(target, ".agentic-doc-governance.json"),
    JSON.stringify({
      docs: { roots: ["docs"] },
      generated: { requiredPaths: [] },
    }),
  );
  fs.writeFileSync(
    path.join(target, "docs", "canonical", "features", "FEAT-001-missing-backlog.md"),
    [
      "> Status: `PLANNED`",
      "> Risk tier: `T2`",
      "",
      "# FEAT-001 - Missing Backlog",
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
    JSON.parse(result.stdout).issues.some((issue) => issue.code === "FEATURE_BACKLOG_MISSING"),
    true,
  );
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

test("docs check reports duplicate backlog rows, missing owner docs, and invalid priorities", () => {
  const target = path.join(tempDir(), "product");
  assert.equal(run([cli, "init", target]).status, 0);
  const backlogPath = path.join(target, "docs", "canonical", "active-backlog.md");
  const current = fs.readFileSync(backlogPath, "utf8");
  fs.writeFileSync(
    backlogPath,
    [
      current.replace("| `P1` |", "| `P9` |").trimEnd(),
      "| `FEAT-001` | Duplicate | `PLANNED` | `P1` | Duplicate row. | [`FEAT-001-example-feature.md`](features/FEAT-001-example-feature.md) |",
      "| `FEAT-999` | Missing Owner | `PLANNED` | `P1` | No owner doc. | [`FEAT-999-missing.md`](features/FEAT-999-missing.md) |",
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
  const issues = JSON.parse(result.stdout).issues;
  assert.equal(issues.some((issue) => issue.code === "BACKLOG_ROW_DUPLICATE"), true);
  assert.equal(issues.some((issue) => issue.code === "FEAT_OWNER_MISSING"), true);
  assert.equal(issues.some((issue) => issue.code === "BACKLOG_PRIORITY_INVALID"), true);
});

test("docs check validates feature risk tier and primary skill", () => {
  const target = path.join(tempDir(), "product");
  assert.equal(run([cli, "init", target]).status, 0);
  const featurePath = path.join(target, "docs", "canonical", "features", "FEAT-001-example-feature.md");
  const text = fs.readFileSync(featurePath, "utf8")
    .replace("> Risk tier: `T2`", "> Risk tier: `T9`")
    .replace("> Primary skill: `implementation-surface`", "> Primary skill: `missing-skill`");
  fs.writeFileSync(featurePath, text);

  const result = run([
    path.join(repoRoot, "scripts", "docs-integrity-check.mjs"),
    "--root",
    target,
    "--json",
  ]);

  assert.notEqual(result.status, 0);
  const issues = JSON.parse(result.stdout).issues;
  assert.equal(issues.some((issue) => issue.code === "RISK_TIER_INVALID"), true);
  assert.equal(issues.some((issue) => issue.code === "FEAT_SKILL_MISSING"), true);
});

test("docs check reports feature owner docs missing required sections", () => {
  const target = path.join(tempDir(), "product");
  assert.equal(run([cli, "init", target]).status, 0);
  const featurePath = path.join(target, "docs", "canonical", "features", "FEAT-001-example-feature.md");
  const text = fs.readFileSync(featurePath, "utf8").replace(/\n## Goal\n\n[\s\S]*?\n## Non-goals/, "\n## Non-goals");
  fs.writeFileSync(featurePath, text);

  const result = run([
    path.join(repoRoot, "scripts", "docs-integrity-check.mjs"),
    "--root",
    target,
    "--json",
  ]);

  assert.notEqual(result.status, 0);
  const issues = JSON.parse(result.stdout).issues;
  assert.equal(issues.some((issue) => issue.code === "FEATURE_SECTION_MISSING" && issue.observed.section === "Goal"), true);
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

test("docs check rejects links that stay in project root but leave configured docs roots", () => {
  const target = tempDir();
  fs.mkdirSync(path.join(target, "docs"), { recursive: true });
  fs.writeFileSync(path.join(target, "package.json"), "{}\n");
  fs.writeFileSync(
    path.join(target, ".agentic-doc-governance.json"),
    JSON.stringify({ docs: { roots: ["docs"] }, generated: { requiredPaths: [] } }),
  );
  fs.writeFileSync(path.join(target, "docs", "README.md"), "[package](../package.json)\n");

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

test("docs check validates configured paths before scanning", () => {
  const target = tempDir();
  fs.writeFileSync(
    path.join(target, ".agentic-doc-governance.json"),
    JSON.stringify({
      docs: { roots: ["../docs"] },
      generated: { requiredPaths: [] },
    }),
  );

  const result = run([
    path.join(repoRoot, "scripts", "docs-integrity-check.mjs"),
    "--root",
    target,
    "--json",
  ]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /docs\.roots\[0\] must stay inside the project root/);
  assert.doesNotMatch(result.stderr, /GovernanceConfigError|at /);
});

test("docs check allows repo-root documentation roots", () => {
  const target = tempDir();
  fs.writeFileSync(
    path.join(target, ".agentic-doc-governance.json"),
    JSON.stringify({
      docs: { roots: ["."] },
      generated: { requiredPaths: [] },
    }),
  );
  fs.writeFileSync(path.join(target, "README.md"), "# Root Docs\n");

  const report = parseJson(run([
    path.join(repoRoot, "scripts", "docs-integrity-check.mjs"),
    "--root",
    target,
    "--json",
  ]));

  assert.equal(report.ok, true);
});

test("feature add rejects unsafe closeout paths before writing files", () => {
  const target = tempDir();
  fs.writeFileSync(
    path.join(target, ".agentic-doc-governance.json"),
    JSON.stringify({
      docs: { roots: ["docs"] },
      skills: { roots: [] },
      generated: { requiredPaths: [] },
      closeout: {
        backlogPath: "../backlog.md",
        featureRoot: "docs/canonical/features",
      },
    }),
  );

  const result = run([
    cli,
    "feature",
    "add",
    "FEAT-404",
    "Unsafe Config",
    "--root",
    target,
  ]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /closeout\.backlogPath must stay inside the project root/);
  assert.equal(fs.existsSync(path.join(target, "docs", "canonical", "features", "FEAT-404-unsafe-config.md")), false);
});

test("docs check allows links between configured docs roots", () => {
  const target = tempDir();
  fs.mkdirSync(path.join(target, "docs"), { recursive: true });
  fs.mkdirSync(path.join(target, "handbook"), { recursive: true });
  fs.writeFileSync(
    path.join(target, ".agentic-doc-governance.json"),
    JSON.stringify({
      docs: { roots: ["docs", "handbook"] },
      generated: { requiredPaths: [] },
    }),
  );
  fs.writeFileSync(path.join(target, "docs", "README.md"), "[guide](../handbook/guide.md)\n");
  fs.writeFileSync(path.join(target, "handbook", "guide.md"), "# Guide\n");

  const report = parseJson(run([
    path.join(repoRoot, "scripts", "docs-integrity-check.mjs"),
    "--root",
    target,
    "--json",
  ]));

  assert.equal(report.ok, true);
});

test("docs check validates reference-style markdown links", () => {
  const target = tempDir();
  fs.mkdirSync(path.join(target, "docs"), { recursive: true });
  fs.writeFileSync(
    path.join(target, ".agentic-doc-governance.json"),
    JSON.stringify({ docs: { roots: ["docs"] }, generated: { requiredPaths: [] } }),
  );
  fs.writeFileSync(
    path.join(target, "docs", "README.md"),
    [
      "[guide][guide]",
      "",
      "[guide]: missing-guide.md \"Guide\"",
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
    JSON.parse(result.stdout).issues.some((issue) => issue.code === "BROKEN_INTERNAL_LINK" && issue.observed.target === "missing-guide.md"),
    true,
  );
});

test("docs check handles controlled markdown link forms and ignores code examples", () => {
  const target = tempDir();
  fs.mkdirSync(path.join(target, "docs", "guides"), { recursive: true });
  fs.writeFileSync(
    path.join(target, ".agentic-doc-governance.json"),
    JSON.stringify({ docs: { roots: ["docs"] }, generated: { requiredPaths: [] } }),
  );
  fs.writeFileSync(path.join(target, "docs", "guides", "rollout (v1).md"), "# Rollout\n");
  fs.writeFileSync(path.join(target, "docs", "guides", "api(v1).md"), "# API\n");
  fs.writeFileSync(path.join(target, "docs", "guides", "space guide.md"), "# Space Guide\n");
  fs.writeFileSync(
    path.join(target, "docs", "README.md"),
    [
      "[balanced](guides/rollout%20%28v1%29.md)",
      "[paren](guides/api(v1).md)",
      "[angle](<guides/space guide.md>)",
      "`[ignored](missing-inline.md)`",
      "",
      "```md",
      "[ignored](missing-fenced.md)",
      "```",
      "",
    ].join("\n"),
  );

  const report = parseJson(run([
    path.join(repoRoot, "scripts", "docs-integrity-check.mjs"),
    "--root",
    target,
    "--json",
  ]));

  assert.equal(report.ok, true);
});

test("backlog primary doc links support balanced parentheses", () => {
  const target = path.join(tempDir(), "product");
  assert.equal(run([cli, "init", target]).status, 0);
  const featureDir = path.join(target, "docs", "canonical", "features");
  const original = path.join(featureDir, "FEAT-001-example-feature.md");
  const renamed = path.join(featureDir, "FEAT-001-example(v1).md");
  fs.renameSync(original, renamed);

  const backlogPath = path.join(target, "docs", "canonical", "active-backlog.md");
  fs.writeFileSync(
    backlogPath,
    fs.readFileSync(backlogPath, "utf8").replace("features/FEAT-001-example-feature.md", "features/FEAT-001-example(v1).md"),
  );

  const docsReport = parseJson(run([
    path.join(repoRoot, "scripts", "docs-integrity-check.mjs"),
    "--root",
    target,
    "--json",
  ]));
  const closeoutReport = parseJson(run([
    path.join(repoRoot, "scripts", "agent-closeout-check.mjs"),
    "--root",
    target,
    "--feature",
    "FEAT-001",
    "--json",
  ]));

  assert.equal(docsReport.ok, true);
  assert.equal(closeoutReport.ok, true);
});

test("docs check ignores bare closing-bracket parenthesis text", () => {
  const target = tempDir();
  fs.mkdirSync(path.join(target, "docs"), { recursive: true });
  fs.writeFileSync(
    path.join(target, ".agentic-doc-governance.json"),
    JSON.stringify({ docs: { roots: ["docs"] }, generated: { requiredPaths: [] } }),
  );
  fs.writeFileSync(
    path.join(target, "docs", "README.md"),
    [
      "A malformed prose fragment like ](missing.md) is not a link.",
      "\\[escaped](also-missing.md) is not a link either.",
      "",
    ].join("\n"),
  );

  const report = parseJson(run([
    path.join(repoRoot, "scripts", "docs-integrity-check.mjs"),
    "--root",
    target,
    "--json",
  ]));

  assert.equal(report.ok, true);
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

test("closeout check rejects backlog primary doc links outside configured docs roots", () => {
  const target = path.join(tempDir(), "product");
  assert.equal(run([cli, "init", target]).status, 0);
  fs.writeFileSync(path.join(target, "package.json"), "{}\n");
  const backlogPath = path.join(target, "docs", "canonical", "active-backlog.md");
  fs.writeFileSync(
    backlogPath,
    fs.readFileSync(backlogPath, "utf8").replace("features/FEAT-001-example-feature.md", "../../package.json"),
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

test("closeout check rejects projects with missing configured docs roots", () => {
  const target = path.join(tempDir(), "product");
  assert.equal(run([cli, "init", target]).status, 0);
  const configPath = path.join(target, ".agentic-doc-governance.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.docs.roots = ["governance"];
  fs.writeFileSync(configPath, JSON.stringify(config));

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
    JSON.parse(report.stdout).issues.some((issue) => issue.code === "DOC_ROOT_MISSING"),
    true,
  );
});

test("closeout check reports duplicate, malformed, and invalid-priority backlog rows", () => {
  const target = path.join(tempDir(), "product");
  assert.equal(run([cli, "init", target]).status, 0);
  const backlogPath = path.join(target, "docs", "canonical", "active-backlog.md");
  const current = fs.readFileSync(backlogPath, "utf8");
  fs.writeFileSync(
    backlogPath,
    [
      current.replace("| `P1` |", "| `P9` |").trimEnd(),
      "| `FEAT-001` | Missing Cells |",
      "| `FEAT-001` | Duplicate | `PLANNED` | `P1` | Duplicate row. | [`FEAT-001-example-feature.md`](features/FEAT-001-example-feature.md) |",
      "",
    ].join("\n"),
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
  assert.equal(issues.some((issue) => issue.code === "BACKLOG_ROW_DUPLICATE"), true);
  assert.equal(issues.some((issue) => issue.code === "BACKLOG_ROW_MALFORMED"), true);
  assert.equal(issues.some((issue) => issue.code === "BACKLOG_PRIORITY_INVALID"), true);
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

test("multi-file writes roll back already-written files on failure", () => {
  const target = tempDir();
  const first = path.join(target, "first.md");
  const blockingParent = path.join(target, "blocked");
  const second = path.join(blockingParent, "second.md");
  fs.writeFileSync(first, "before\n");
  fs.writeFileSync(blockingParent, "not a directory\n");

  assert.throws(
    () => writeTextFilesWithRollback([
      { target: first, text: "after\n" },
      { target: second, text: "never\n" },
    ]),
    /EEXIST|ENOTDIR|not a directory/,
  );
  assert.equal(fs.readFileSync(first, "utf8"), "before\n");
  assert.equal(fs.existsSync(second), false);
});

function packageFixture(overrides = {}) {
  return {
    name: "fixture-package",
    version: "1.0.0",
    description: "Fixture package.",
    license: "MIT",
    bin: { "agentic-doc-governance": "bin/agentic-doc-governance.mjs" },
    files: ["bin", "scripts", "templates"],
    ...overrides,
  };
}

function writePackageFixture(pkg) {
  const target = tempDir();
  const packagePath = path.join(target, "package.json");
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2));
  return packagePath;
}

test("package metadata check warns in development and blocks strict fixture checks", () => {
  const packagePath = writePackageFixture(packageFixture());

  const relaxed = parseJson(run([
    path.join(repoRoot, "scripts", "package-metadata-check.mjs"),
    "--package",
    packagePath,
    "--json",
  ]));
  assert.equal(relaxed.ok, true);
  assert.equal(relaxed.issues.some((issue) => issue.code === "PACKAGE_REPOSITORY_MISSING" && issue.severity === "warning"), true);

  const strict = run([
    path.join(repoRoot, "scripts", "package-metadata-check.mjs"),
    "--package",
    packagePath,
    "--strict",
    "--json",
  ]);
  assert.equal(strict.status, 1);
  assert.equal(
    JSON.parse(strict.stdout).issues.some((issue) => issue.code === "PACKAGE_REPOSITORY_MISSING" && issue.severity === "error"),
    true,
  );
});

test("package metadata check rejects malformed git repository URLs and accepts public URLs", () => {
  const malformedPackage = writePackageFixture(packageFixture({
    repository: "git+not-a-url",
    homepage: "https://example.com/fixture-package",
    bugs: { url: "https://example.com/fixture-package/issues" },
  }));

  const malformed = run([
    path.join(repoRoot, "scripts", "package-metadata-check.mjs"),
    "--package",
    malformedPackage,
    "--strict",
    "--json",
  ]);
  assert.equal(malformed.status, 1);
  assert.equal(
    JSON.parse(malformed.stdout).issues.some((issue) => issue.code === "PACKAGE_REPOSITORY_WEAK"),
    true,
  );

  const validPackage = writePackageFixture(packageFixture({
    repository: { type: "git", url: "git+https://github.com/example/fixture-package.git" },
    homepage: "https://github.com/example/fixture-package#readme",
    bugs: { url: "https://github.com/example/fixture-package/issues" },
  }));
  const valid = parseJson(run([
    path.join(repoRoot, "scripts", "package-metadata-check.mjs"),
    "--package",
    validPackage,
    "--strict",
    "--json",
  ]));

  assert.equal(valid.ok, true);
});

test("packed package includes self-check footprint and installed CLI can initialize a project", () => {
  const workspace = tempDir();
  const target = path.join(workspace, "product");
  const { files, cliPath: installedCli } = packAndInstallPackage(workspace);
  assert.equal(files.has(".github/workflows/ci.yml"), false);
  assert.equal(files.has("test/cli-and-checkers.test.mjs"), false);
  assert.equal(files.has("scripts/package-metadata-check.mjs"), true);
  assert.equal(files.has("scripts/lib/cli-feature.mjs"), true);
  assert.equal(files.has("scripts/lib/cli-init.mjs"), true);
  assert.equal(files.has("scripts/lib/governance-markdown.mjs"), true);
  assert.equal(files.has("scripts/lib/markdown-table.mjs"), true);

  const version = run([installedCli, "--version"]);
  assert.equal(version.status, 0, version.stderr);
  const init = run([installedCli, "init", target]);
  assert.equal(init.status, 0, init.stderr);
  const docsCheck = run([installedCli, "docs-check", "--root", target, "--check-generated"]);
  assert.equal(docsCheck.status, 0, docsCheck.stderr || docsCheck.stdout);
});

test("smoke: installed package CLI handles multiple target projects and checker commands", () => {
  const workspace = tempDir();
  const { cliPath: installedCli } = packAndInstallPackage(workspace);
  const alpha = path.join(workspace, "alpha");
  const beta = path.join(workspace, "beta");

  const alphaDryRun = run([installedCli, "init", alpha, "--dry-run"]);
  assert.equal(alphaDryRun.status, 0, alphaDryRun.stderr);
  assert.equal(fs.existsSync(alpha), false);

  assert.equal(run([installedCli, "init", alpha]).status, 0);
  assert.equal(run([installedCli, "init", beta]).status, 0);

  addFeatureSmoke(installedCli, alpha, {
    id: "FEAT-020",
    name: "Alpha Report",
    status: "VERIFYING",
    risk: "T2",
    priority: "P1",
    summary: "Summarize alpha workflow health.",
    owner: "alpha-team",
    skill: "implementation-surface",
  });
  addFeatureSmoke(installedCli, alpha, {
    id: "FEAT-021",
    name: "Alpha Copy",
    status: "IDEA",
    risk: "T3",
    priority: "P3",
    summary: "Shorten alpha setup labels.",
    owner: "docs",
    skill: "feature-readiness",
  });
  addFeatureSmoke(installedCli, beta, {
    id: "FEAT-030",
    name: "Beta Audit",
    status: "PLANNED",
    risk: "T1",
    priority: "P0",
    summary: "Track beta audit evidence.",
    owner: "security",
    skill: "feature-lifecycle",
  });

  for (const target of [alpha, beta]) {
    const docsCheck = parseJson(run([installedCli, "docs-check", "--root", target, "--check-generated", "--json"]));
    assert.equal(docsCheck.ok, true);
    const skillsCheck = parseJson(run([installedCli, "skills-check", "--root", target, "--json"]));
    assert.equal(skillsCheck.ok, true);
  }

  const closeoutCheck = parseJson(run([installedCli, "closeout-check", "--root", alpha, "--feature", "FEAT-021", "--json"]));
  assert.equal(closeoutCheck.ok, true);
});
