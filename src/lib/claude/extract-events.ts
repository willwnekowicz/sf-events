import { getClaudeClient } from "./client";

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

Only include events in San Francisco / Bay Area. Only include events happening today or in the future. Prefer canonical event detail URLs from the original source domain. Return valid JSON only, no markdown.`;

export async function extractEventsFromHtml(
  html: string,
  sourceName: string
): Promise<ExtractedEvent[]> {
  const client = getClaudeClient();

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Extract all upcoming events from this ${sourceName} events page HTML. ${EVENT_SCHEMA}\n\nIf the HTML includes both list-page links and detail-page links, always choose the detail-page link for each event.\n\nHTML:\n${html.slice(0, 50000)}`,
      },
    ],
  });

  return parseEventsResponse(response);
}

export async function extractEventsViaWebSearch(
  query: string,
  sourceName: string
): Promise<ExtractedEvent[]> {
  const client = getClaudeClient();
  const today = new Date().toISOString().split("T")[0];

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 5,
      },
    ],
    messages: [
      {
        role: "user",
        content: `Search for: ${query}\n\nFind upcoming events from today (${today}) through the next 30 days. ${EVENT_SCHEMA}\n\nFor each result, click through until you have the exact event detail page URL, not an index page. After searching, compile all events you found into the JSON array format described above.`,
      },
    ],
  });

  return parseEventsResponse(response);
}

function parseEventsResponse(response: any): ExtractedEvent[] {
  for (const block of response.content) {
    if (block.type === "text") {
      try {
        const jsonMatch = block.text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch {
        console.error("Failed to parse events JSON:", block.text.slice(0, 200));
      }
    }
  }
  return [];
}
