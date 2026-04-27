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

function stripCodeSpans(line) {
  let out = "";
  let index = 0;
  while (index < line.length) {
    if (line[index] !== "`") {
      out += line[index];
      index += 1;
      continue;
    }
    const tickRun = line.slice(index).match(/^`+/)?.[0] ?? "";
    const close = line.indexOf(tickRun, index + tickRun.length);
    if (close === -1) {
      out += line[index];
      index += 1;
    } else {
      out += " ".repeat(close + tickRun.length - index);
      index = close + tickRun.length;
    }
  }
  return out;
}

function stripCodeBlocks(text) {
  let inFence = false;
  return text
    .split(/\r?\n/)
    .map((line) => {
      if (/^\s{0,3}(```|~~~)/.test(line)) {
        inFence = !inFence;
        return "";
      }
      return inFence ? "" : stripCodeSpans(line);
    })
    .join("\n");
}

function readInlineDestination(text, start) {
  let index = start;
  while (/\s/.test(text[index] ?? "")) index += 1;
  if (index >= text.length) return null;

  if (text[index] === "<") {
    const end = text.indexOf(">", index + 1);
    if (end === -1) return null;
    return text.slice(index, end + 1);
  }

  let destination = "";
  let depth = 0;
  for (; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\\") {
      destination += char;
      if (index + 1 < text.length) {
        destination += text[index + 1];
        index += 1;
      }
      continue;
    }
    if (/\s/.test(char) && depth === 0) break;
    if (char === "(") depth += 1;
    if (char === ")") {
      if (depth === 0) break;
      depth -= 1;
    }
    destination += char;
  }
  return destination || null;
}

function hasOpeningLinkBracket(text, closeBracketIndex) {
  for (let index = closeBracketIndex - 1; index >= 0; index -= 1) {
    const char = text[index];
    if (char === "\n") return false;
    if (char !== "[") continue;
    const slashCount = [...text.slice(0, index).matchAll(/\\+$/g)][0]?.[0].length ?? 0;
    return slashCount % 2 === 0;
  }
  return false;
}

function extractInlineLinks(text) {
  const links = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "]" || text[index + 1] !== "(") continue;
    if (!hasOpeningLinkBracket(text, index)) continue;
    const destination = readInlineDestination(text, index + 2);
    if (destination) links.push(destination);
  }
  return links;
}

export function extractLinks(text) {
  const linkableText = stripCodeBlocks(text);
  const inlineLinks = extractInlineLinks(linkableText);
  const referenceLinks = [...linkableText.matchAll(/^\s{0,3}\[[^\]\n]+\]:\s*(<[^>\n]+>|[^\s]+)(?:\s+["'][^"']*["'])?\s*$/gm)].map((match) => match[1]);
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
