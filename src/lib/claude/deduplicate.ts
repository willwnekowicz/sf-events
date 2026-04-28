import { runClaudeCode, extractJsonArray } from "./code-cli";
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

  const existingList = existingEvents
    .map((e, i) => `${i}. "${e.title}" at ${e.venue}`)
    .join("\n");
  const newList = newEvents.map((e, i) => `${i}. "${e.title}" at ${e.venue}`).join("\n");

  const prompt = `Identify which new events are duplicates of existing events. Account for minor name/venue variations.

EXISTING EVENTS:
${existingList}

NEW EVENTS:
${newList}

Return ONLY a JSON array of new event indices that are NOT duplicates. No prose, no markdown.
Example: [0, 2, 5]`;

  const result = await runClaudeCode({ prompt, allowedTools: [], timeoutMs: 90_000 });
  const keepIndices = extractJsonArray<number>(result);

  if (keepIndices.length === 0) return newEvents;
  return keepIndices.filter((i) => i < newEvents.length).map((i) => newEvents[i]);
}
