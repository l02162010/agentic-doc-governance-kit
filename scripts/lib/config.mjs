import fs from "node:fs";
import path from "node:path";

export const CONFIG_FILE = ".agentic-doc-governance.json";

export class GovernanceConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "GovernanceConfigError";
    this.exitCode = 2;
  }
}

export const DEFAULT_DOC_ROOTS = [
  "docs",
  "templates/docs",
  "examples/basic-product/docs",
];

export const DEFAULT_SKILL_ROOTS = [
  ".codex/skills",
  "templates/.codex/skills",
  "examples/basic-product/.codex/skills",
];

export const DEFAULT_GENERATED_REQUIRED_PATHS = [
  ".agentic-doc-governance.json",
  "AGENTS.md",
  "docs/README.md",
  "docs/canonical/active-backlog.md",
  "docs/canonical/agent-execution-contract.md",
  "docs/canonical/documentation-governance.md",
  "docs/canonical/feature-lifecycle-governance.md",
  "docs/canonical/product-runtime-spec.md",
  "docs/canonical/features/FEAT-001-example-feature.md",
  "docs/canonical/features/feature-template.md",
  "docs/runbooks/docs-integrity-check.md",
  ".codex/skills/README.md",
  ".codex/skills/feature-lifecycle/SKILL.md",
  ".codex/skills/feature-readiness/SKILL.md",
  ".codex/skills/implementation-surface/SKILL.md",
  "scripts/docs-integrity-check.mjs",
  "scripts/skills-integrity-check.mjs",
  "scripts/agent-closeout-check.mjs",
  "scripts/lib/args.mjs",
  "scripts/lib/config.mjs",
  "scripts/lib/feature-lifecycle.mjs",
  "scripts/lib/governance-markdown.mjs",
  "scripts/lib/markdown-table.mjs",
];

export const DEFAULT_CLOSEOUT = {
  backlogPath: "docs/canonical/active-backlog.md",
  featureRoot: "docs/canonical/features",
  validRiskTiers: ["T1", "T2", "T3"],
  validPriorities: ["P0", "P1", "P2", "P3"],
  formalRiskTiers: ["T1", "T2"],
  requiredMetadataFields: [
    "Status",
    "Owner",
    "Source of truth for",
    "Risk tier",
    "Primary skill",
    "Required gates",
    "Verification",
    "Closeout evidence",
    "Indexed by",
  ],
  requiredManifestFields: [
    "runtime contract",
    "verification",
    "legal outcome",
    "ai outcome",
    "runbook outcome",
    "release outcome",
    "semantic review",
    "acceptance waivers",
    "residual risks",
  ],
  requiredFeatureSections: [
    "Problem",
    "Goal",
    "Non-goals",
    "User-facing Behavior",
    "Scope",
    "Acceptance Criteria",
    "Rollout and Verification",
  ],
};

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function validateRelativePath(value, label, { allowCurrent = false } = {}) {
  if (typeof value !== "string") throw new GovernanceConfigError(`${label} must be a string path.`);
  if (value.length === 0) throw new GovernanceConfigError(`${label} must not be empty.`);
  if (value !== value.trim()) throw new GovernanceConfigError(`${label} must not contain leading or trailing whitespace.`);
  if (value.includes("\0")) throw new GovernanceConfigError(`${label} must not contain null bytes.`);
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) throw new GovernanceConfigError(`${label} must be a relative repo-local path, not a URL or drive path: ${value}`);

  const withForwardSlashes = value.replace(/\\/g, "/");
  if (path.posix.isAbsolute(withForwardSlashes) || path.isAbsolute(value)) {
    throw new GovernanceConfigError(`${label} must be a relative repo-local path: ${value}`);
  }

  const normalized = path.posix.normalize(withForwardSlashes);
  if (normalized === ".") {
    if (allowCurrent) return normalized;
    throw new GovernanceConfigError(`${label} must not point at the project root: ${value}`);
  }
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new GovernanceConfigError(`${label} must stay inside the project root: ${value}`);
  }
  return normalized.replace(/\/+$/, "");
}

function arrayValue(value, fallback, label, { pathValues = false, allowEmpty = true, allowCurrentPath = false } = {}) {
  const source = value === undefined ? fallback : value;
  if (!Array.isArray(source)) throw new GovernanceConfigError(`${label} must be an array.`);
  if (!allowEmpty && source.length === 0) throw new GovernanceConfigError(`${label} must not be empty.`);
  return source.map((item, index) => {
    const itemLabel = `${label}[${index}]`;
    if (pathValues) return validateRelativePath(item, itemLabel, { allowCurrent: allowCurrentPath });
    if (typeof item !== "string" || item.length === 0) {
      throw new GovernanceConfigError(`${itemLabel} must be a non-empty string.`);
    }
    if (/[\r\n]/.test(item)) throw new GovernanceConfigError(`${itemLabel} must be a single line.`);
    return item;
  });
}

function readConfig(root) {
  const configPath = path.join(root, CONFIG_FILE);
  if (!fs.existsSync(configPath)) return {};
  const raw = fs.readFileSync(configPath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new GovernanceConfigError(`Invalid ${CONFIG_FILE}: ${error.message}`);
  }
}

export function loadGovernanceConfig(root) {
  const config = readConfig(root);
  const docs = objectValue(config.docs);
  const skills = objectValue(config.skills);
  const generated = objectValue(config.generated);
  const closeout = objectValue(config.closeout);

  return {
    docs: {
      roots: arrayValue(docs.roots, DEFAULT_DOC_ROOTS, "docs.roots", { pathValues: true, allowEmpty: false, allowCurrentPath: true }),
    },
    skills: {
      roots: arrayValue(skills.roots, DEFAULT_SKILL_ROOTS, "skills.roots", { pathValues: true, allowCurrentPath: true }),
    },
    generated: {
      requiredPaths: arrayValue(generated.requiredPaths, DEFAULT_GENERATED_REQUIRED_PATHS, "generated.requiredPaths", { pathValues: true }),
    },
    closeout: {
      ...DEFAULT_CLOSEOUT,
      ...closeout,
      backlogPath: validateRelativePath(closeout.backlogPath ?? DEFAULT_CLOSEOUT.backlogPath, "closeout.backlogPath"),
      featureRoot: validateRelativePath(closeout.featureRoot ?? DEFAULT_CLOSEOUT.featureRoot, "closeout.featureRoot"),
      validRiskTiers: arrayValue(closeout.validRiskTiers, DEFAULT_CLOSEOUT.validRiskTiers, "closeout.validRiskTiers"),
      validPriorities: arrayValue(closeout.validPriorities, DEFAULT_CLOSEOUT.validPriorities, "closeout.validPriorities"),
      formalRiskTiers: arrayValue(closeout.formalRiskTiers, DEFAULT_CLOSEOUT.formalRiskTiers, "closeout.formalRiskTiers"),
      requiredMetadataFields: arrayValue(closeout.requiredMetadataFields, DEFAULT_CLOSEOUT.requiredMetadataFields, "closeout.requiredMetadataFields"),
      requiredManifestFields: arrayValue(closeout.requiredManifestFields, DEFAULT_CLOSEOUT.requiredManifestFields, "closeout.requiredManifestFields"),
      requiredFeatureSections: arrayValue(closeout.requiredFeatureSections, DEFAULT_CLOSEOUT.requiredFeatureSections, "closeout.requiredFeatureSections"),
    },
  };
}
