const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u",
  "h2", "h3", "h4", "div", "ul", "ol", "li", "blockquote", "a",
]);

/**
 * Allow only the formatting tags exposed by the blog editor.
 * Strip active content and all attributes except safe link destinations.
 */
export const sanitizePostHtml = (value = "") => {
  const html = String(value)
    .replace(/<\s*(script|style|iframe|object|embed|svg|math)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<!--([\s\S]*?)-->/g, "");

  return html.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (match, rawTag, rawAttributes) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";

    const closing = /^<\s*\//.test(match);
    if (closing || tag === "br") return tag === "br" ? "<br>" : "</" + tag + ">";
    if (tag !== "a") return "<" + tag + ">";

    const href = rawAttributes.match(/href\s*=\s*(["'])(.*?)\1/i)?.[2] || "";
    const safeHref = /^(https:\/\/|mailto:)/i.test(href) ? href.replace(/["<>]/g, "") : "";
    return safeHref
      ? '<a href="' + safeHref + '" rel="noopener noreferrer" target="_blank">'
      : "<a>";
  });
};
