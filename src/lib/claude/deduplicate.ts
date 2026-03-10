import { getClaudeClient } from "./client";
import type { ExtractedEvent } from "./extract-events";

interface ExistingEvent {
  title: string;
  venue: string;
}

export async function filterDuplicates(
  newEvents: ExtractedEvent[],
  existingEvents: ExistingEvent[]
): Promise<ExtractedEvent[]> {
  if (existingEvents.length === 0) return newEvents;
  if (newEvents.length === 0) return [];

  const client = getClaudeClient();

  const existingList = existingEvents.map((e, i) => `${i}. "${e.title}" at ${e.venue}`).join("\n");
  const newList = newEvents.map((e, i) => `${i}. "${e.title}" at ${e.venue}`).join("\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Identify which new events are duplicates of existing events. Account for minor name/venue variations.\n\nEXISTING EVENTS:\n${existingList}\n\nNEW EVENTS:\n${newList}\n\nReturn a JSON array of new event indices that are NOT duplicates. Only valid JSON, no markdown.\nExample: [0, 2, 5]`,
      },
    ],
  });

  for (const block of response.content) {
    if (block.type === "text") {
      try {
        const jsonMatch = block.text.match(/\[[\s\S]*?\]/);
        if (jsonMatch) {
          const keepIndices: number[] = JSON.parse(jsonMatch[0]);
          return keepIndices.filter((i) => i < newEvents.length).map((i) => newEvents[i]);
        }
      } catch {
        console.error("Failed to parse dedup response:", block.text.slice(0, 200));
      }
    }
  }

  return newEvents;
}
