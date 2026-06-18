import { runClaudeCode, extractJsonArray } from "./code-cli";
import { htmlToText } from "@/lib/scraper/html-to-text";

// Budget of *cleaned text* (not raw HTML) passed inline to the CLI prompt.
// Raw HTML wasted this on boilerplate; after htmlToText the same budget holds
// far more actual event content, so we can also afford a larger window.
const EXTRACT_CHAR_BUDGET = 90_000;

export interface ExtractedEvent {
  title: string;
  date: string;
  time: string | null;
  venue: string;
  address: string | null;
  description: string | null;
  price: string | null;
  url: string | null;
  imageUrl: string | null;
}

const EVENT_SCHEMA = `Return a JSON array of events. Each event object must have:
- title (string, required)
- date (string, YYYY-MM-DD format, required)
- time (string, HH:MM 24-hour format, or null)
- venue (string, required)
- address (string, full street address in San Francisco, or null)
- description (string, 1-2 sentence summary, or null)
- price (string like "Free", "$15", "$20-$45", or null)
- url (string, IMPORTANT: always include the direct event detail page URL for that exact event, never a generic index/listing page or homepage; if search lands on an index page, follow through and return the detail page link, or null only if truly unavailable)
- imageUrl (string, event image URL, or null)

Only include events in San Francisco / Bay Area. Only include events happening today or in the future. Prefer canonical event detail URLs from the original source domain. Return ONLY a valid JSON array (no prose, no markdown fences).`;

/**
 * Extract structured events from already-fetched page content. The `content`
 * may be raw HTML (Web Unlocker / Scraping Browser), Markdown, or a concatenation
 * of search-result pages — all that matters is the event details are present in
 * the text. Fetching is Bright Data's job; this is pure text → JSON.
 */
export async function extractEventsFromHtml(
  content: string,
  sourceName: string
): Promise<ExtractedEvent[]> {
  // Strip HTML boilerplate to dense text first, THEN truncate — otherwise the
  // budget is spent on <head>/scripts/nav before reaching the event listings.
  const snippet = htmlToText(content).slice(0, EXTRACT_CHAR_BUDGET);
  const today = new Date().toISOString().split("T")[0];
  const prompt = `Extract all upcoming events from this ${sourceName} content (may be HTML, Markdown, or concatenated search-result pages). Today is ${today}; only include events happening today or later. ${EVENT_SCHEMA}

If both list-page links and detail-page links are present, always choose the detail-page link for each event.

CONTENT:
${snippet}`;

  const result = await runClaudeCode({
    prompt,
    // No tools needed — extracting from provided content.
    allowedTools: [],
    timeoutMs: 180_000,
  });
  return extractJsonArray<ExtractedEvent>(result);
}
