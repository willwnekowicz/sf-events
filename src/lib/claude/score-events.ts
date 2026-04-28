import { runClaudeCode, extractJsonObject } from "./code-cli";
import type { ExtractedEvent } from "./extract-events";

export async function scoreEvents(
  events: ExtractedEvent[],
  profileText: string
): Promise<Map<string, number>> {
  if (events.length === 0) return new Map();

  const eventList = events
    .map(
      (e, i) =>
        `${i}. "${e.title}" - ${e.venue} - ${e.description ?? "no description"} - ${e.price ?? "unknown price"}`
    )
    .join("\n");

  const prompt = `You are an event recommendation engine. Score each event 0-100 based on how well it matches this user's preferences.

USER PREFERENCES:
${profileText}

EVENTS TO SCORE:
${eventList}

Return ONLY a JSON object mapping event index (as string) to score (integer 0-100). No prose, no markdown.
Example: {"0": 85, "1": 42, "2": 91}`;

  const result = await runClaudeCode({ prompt, allowedTools: [], timeoutMs: 120_000 });
  const parsed = extractJsonObject<Record<string, number>>(result) ?? {};

  const scores = new Map<string, number>();
  for (const [idx, score] of Object.entries(parsed)) {
    const event = events[parseInt(idx)];
    if (event) {
      scores.set(`${event.title}|${event.date}|${event.venue}`, score as number);
    }
  }
  return scores;
}
