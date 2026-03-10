import { getClaudeClient } from "./client";
import type { ExtractedEvent } from "./extract-events";

export async function scoreEvents(
  events: ExtractedEvent[],
  profileText: string
): Promise<Map<string, number>> {
  if (events.length === 0) return new Map();

  const client = getClaudeClient();

  const eventList = events
    .map((e, i) => `${i}. "${e.title}" - ${e.venue} - ${e.description ?? "no description"} - ${e.price ?? "unknown price"}`)
    .join("\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `You are an event recommendation engine. Score each event 0-100 based on how well it matches this user's preferences.\n\nUSER PREFERENCES:\n${profileText}\n\nEVENTS TO SCORE:\n${eventList}\n\nReturn a JSON object mapping event index (as string) to score (integer 0-100). Only valid JSON, no markdown.\nExample: {"0": 85, "1": 42, "2": 91}`,
      },
    ],
  });

  const scores = new Map<string, number>();

  for (const block of response.content) {
    if (block.type === "text") {
      try {
        const jsonMatch = block.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          for (const [idx, score] of Object.entries(parsed)) {
            const event = events[parseInt(idx)];
            if (event) {
              scores.set(`${event.title}|${event.date}|${event.venue}`, score as number);
            }
          }
        }
      } catch {
        console.error("Failed to parse scores:", block.text.slice(0, 200));
      }
    }
  }

  return scores;
}
