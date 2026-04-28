import { runClaudeCode, extractJsonArray } from "./code-cli";

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

export async function extractEventsFromHtml(
  html: string,
  sourceName: string
): Promise<ExtractedEvent[]> {
  // Truncate HTML — we pass it inline to the CLI prompt.
  const snippet = html.slice(0, 50_000);
  const prompt = `Extract all upcoming events from this ${sourceName} events page HTML. ${EVENT_SCHEMA}

If the HTML includes both list-page links and detail-page links, always choose the detail-page link for each event.

HTML:
${snippet}`;

  const result = await runClaudeCode({
    prompt,
    // No tools needed — extracting from provided HTML
    allowedTools: [],
    timeoutMs: 180_000,
  });
  return extractJsonArray<ExtractedEvent>(result);
}

export async function extractEventsViaWebSearch(
  query: string,
  sourceName: string
): Promise<ExtractedEvent[]> {
  const today = new Date().toISOString().split("T")[0];
  const prompt = `Search for: ${query}

Find upcoming events from today (${today}) through the next 30 days for source: ${sourceName}.

${EVENT_SCHEMA}

Use WebSearch to find listings, then use WebFetch on each promising event's detail page to confirm date/venue and grab the canonical URL. Do not return index/listing URLs — always follow through to the event detail page. After gathering, output ONLY a JSON array of events (no prose, no markdown).`;

  const result = await runClaudeCode({
    prompt,
    allowedTools: ["WebSearch", "WebFetch"],
    timeoutMs: 300_000,
  });
  return extractJsonArray<ExtractedEvent>(result);
}
