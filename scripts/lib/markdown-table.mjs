export function unescapeMarkdownTableCell(cell) {
  return cell.replace(/\\\|/g, "|").trim();
}

export function parseMarkdownTableRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return [];

  const cells = [];
  let cell = "";

  for (let index = 1; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (char === "\\" && index + 1 < trimmed.length) {
      cell += char + trimmed[index + 1];
      index += 1;
      continue;
    }
    if (char === "|") {
      cells.push(unescapeMarkdownTableCell(cell));
      cell = "";
      continue;
    }
    cell += char;
  }

  if (cell.trim()) cells.push(unescapeMarkdownTableCell(cell));
  return cells;
}
