export function makeIssue({
  code,
  severity = "error",
  ownerDoc,
  observed = {},
  rationale = code,
  recommendedFix,
  forbiddenFix,
  downgradeCondition,
  relatedDocs = [],
  confidence = 1,
}) {
  return {
    code,
    severity,
    ownerDoc,
    relatedDocs,
    observed,
    rationale,
    recommendedFix,
    forbiddenFix,
    downgradeCondition,
    confidence,
  };
}

export function parseMetadata(text) {
  const metadata = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith(">")) break;
    const match = line.match(/^>\s*([^:]+):\s*(.*)\s*$/);
    if (match) metadata[match[1].trim()] = match[2].trim().replace(/^`|`$/g, "");
  }
  return metadata;
}

export function extractSection(text, heading) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return "";
  const section = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith("## ")) break;
    section.push(lines[index]);
  }
  return section.join("\n").trim();
}

export function hasSection(text, heading) {
  return text.split(/\r?\n/).some((line) => line.trim() === `## ${heading}`);
}

export function extractLinks(text) {
  const inlineLinks = [...text.matchAll(/!?\[[^\]\n]*\]\((<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\)/g)].map((match) => match[1]);
  const referenceLinks = [...text.matchAll(/^\s{0,3}\[[^\]\n]+\]:\s*(<[^>\n]+>|[^\s]+)(?:\s+["'][^"']*["'])?\s*$/gm)].map((match) => match[1]);
  return [...inlineLinks, ...referenceLinks];
}

export function normalizeRootPath(relPath) {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const normalizedPath = normalized ? normalized.split("/").filter(Boolean).join("/") : "";
  return normalizedPath === "." ? "" : normalizedPath.replace(/\/+$/, "");
}

export function isWithinRoot(candidate, allowedRoot) {
  return allowedRoot === "" || candidate === allowedRoot || candidate.startsWith(`${allowedRoot}/`);
}

export function linkIssueCode(error) {
  return error.code === "INTERNAL_LINK_OUTSIDE_ROOT" ? error.code : "MALFORMED_INTERNAL_LINK";
}

function outsideRootError(rawTarget, message) {
  const error = new Error(`${message}: ${rawTarget}`);
  error.code = "INTERNAL_LINK_OUTSIDE_ROOT";
  return error;
}

export function normalizeLink(ownerDoc, rawTarget, configuredDocRoots, {
  outsideRootMessage = "Local link target escapes configured docs roots",
} = {}) {
  const target = rawTarget.trim().replace(/^<|>$/g, "").split("#")[0];
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) return null;

  const decoded = decodeURIComponent(target).replace(/\\/g, "/");
  const base = ownerDoc.replace(/\\/g, "/").split("/").slice(0, -1).join("/") || ".";
  const candidate = decoded.startsWith("/") ? decoded.slice(1) : `${base}/${decoded}`;
  const normalized = candidate.split("/").reduce((parts, part) => {
    if (!part || part === ".") return parts;
    if (part === "..") {
      if (parts.length === 0) return [".."];
      parts.pop();
      return parts;
    }
    parts.push(part);
    return parts;
  }, []).join("/");

  if (normalized === ".." || normalized.startsWith("../")) throw outsideRootError(rawTarget, outsideRootMessage);
  if (configuredDocRoots.length > 0 && !configuredDocRoots.some((docRoot) => isWithinRoot(normalized, docRoot))) {
    throw outsideRootError(rawTarget, outsideRootMessage);
  }
  return normalized;
}
