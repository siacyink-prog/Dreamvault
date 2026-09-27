const MAX_TITLE_LENGTH = 80;

export function cleanTitle(value) {
  return Array.from(String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”‘’]+/, "")
    .replace(/["'“”‘’。.!?？！，,：:；;]+$/g, "")
    .trim())
    .slice(0, MAX_TITLE_LENGTH)
    .join("");
}

export function publicDream(entry) {
  const hidden = entry.visibility === "hidden";
  return {
    id: String(entry.id),
    author: entry.author || "assistant",
    title: entry.title || null,
    content: hidden ? null : entry.content || "",
    visibility: hidden ? "hidden" : "public",
    hidden,
    created_at: entry.created_at,
  };
}

export function pageOf(entries, pageValue, limitValue) {
  const page = Math.max(1, Number.parseInt(pageValue, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(limitValue, 10) || 20));
  const ordered = entries.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const offset = (page - 1) * limit;
  return {
    entries: ordered.slice(offset, offset + limit).map(publicDream),
    total: ordered.length,
    page,
    limit,
  };
}
