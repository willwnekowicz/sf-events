// Convert raw HTML into compact, readable text for LLM event extraction.
//
// Event listings almost always sit well below the fold, buried under <head>,
// nav menus, and inline <script>/<style> blocks. Passing raw HTML to the
// extractor burns its input budget on boilerplate before it ever reaches an
// event — e.g. a 224KB Funcheap page has ~87% of its event content past the
// first 50K chars. Stripping to text lets the same fetch surface far more
// events at no extra fetch cost.
export function htmlToText(input: string): string {
  if (!input) return "";
  // Already plain text / Markdown / JSON — nothing to strip.
  if (!/<[a-z!/]/i.test(input)) return input;

  let s = input;
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  // Drop blocks whose contents are never user-facing event text.
  s = s.replace(
    /<(script|style|noscript|svg|head|template|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi,
    " "
  );
  // Keep link targets — the extractor is asked for canonical detail-page URLs.
  s = s.replace(
    /<a\b[^>]*?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_m, href, inner) => {
      const text = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      return text ? ` ${text} (${href}) ` : ` ${href} `;
    }
  );
  // Turn block-level boundaries into newlines so adjacent listings stay apart.
  s = s.replace(/<(?:br|hr)\b[^>]*>/gi, "\n");
  s = s.replace(/<\/(?:p|div|li|ul|ol|tr|table|section|article|header|footer|nav|h[1-6])>/gi, "\n");
  // Strip every remaining tag.
  s = s.replace(/<[^>]+>/g, " ");
  // Decode the entities that actually show up in event copy.
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;|&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n) => {
      try {
        return String.fromCodePoint(parseInt(n, 10));
      } catch {
        return " ";
      }
    });
  // Collapse whitespace; cap blank-line runs.
  s = s.replace(/[ \t\f\v\r]+/g, " ");
  s = s.replace(/ *\n */g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}
