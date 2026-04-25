import fs from "node:fs";
import path from "node:path";

export const CONFIG_FILE = ".agentic-doc-governance.json";

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
];

export const DEFAULT_CLOSEOUT = {
  backlogPath: "docs/canonical/active-backlog.md",
  featureRoot: "docs/canonical/features",
  validRiskTiers: ["T1", "T2", "T3"],
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
};

function arrayValue(value, fallback) {
  return Array.isArray(value) ? value : fallback;
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function readConfig(root) {
  const configPath = path.join(root, CONFIG_FILE);
  if (!fs.existsSync(configPath)) return {};
  const raw = fs.readFileSync(configPath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid ${CONFIG_FILE}: ${error.message}`);
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
      roots: arrayValue(docs.roots, DEFAULT_DOC_ROOTS),
    },
    skills: {
      roots: arrayValue(skills.roots, DEFAULT_SKILL_ROOTS),
    },
    generated: {
      requiredPaths: arrayValue(generated.requiredPaths, DEFAULT_GENERATED_REQUIRED_PATHS),
    },
    closeout: {
      ...DEFAULT_CLOSEOUT,
      ...closeout,
      validRiskTiers: arrayValue(closeout.validRiskTiers, DEFAULT_CLOSEOUT.validRiskTiers),
      formalRiskTiers: arrayValue(closeout.formalRiskTiers, DEFAULT_CLOSEOUT.formalRiskTiers),
      requiredMetadataFields: arrayValue(closeout.requiredMetadataFields, DEFAULT_CLOSEOUT.requiredMetadataFields),
      requiredManifestFields: arrayValue(closeout.requiredManifestFields, DEFAULT_CLOSEOUT.requiredManifestFields),
    },
  };
}
