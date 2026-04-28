import { runClaudeCode } from "./code-cli";

interface InteractionRecord {
  action: string;
  eventTitle: string;
  eventDescription: string | null;
  eventVenue: string;
  note?: string | null;
}

export async function regenerateProfile(
  currentProfile: string,
  interactions: InteractionRecord[]
): Promise<string> {
  if (interactions.length === 0) return currentProfile;

  const interactionList = interactions
    .map(
      (i) =>
        `${
          i.action === "thumbs_up"
            ? "LIKED"
            : i.action === "thumbs_down"
            ? "DISLIKED"
            : "ADDED TO CALENDAR"
        }: "${i.eventTitle}" at ${i.eventVenue}${
          i.eventDescription ? ` — ${i.eventDescription}` : ""
        }${i.note ? `\nReason: ${i.note}` : ""}`
    )
    .join("\n");

  const prompt = `Update this user preference profile based on their recent event interactions. Keep the same natural language style. Incorporate what the new interactions tell us about their tastes. Don't remove existing preferences unless directly contradicted.

CURRENT PROFILE:
${currentProfile}

RECENT INTERACTIONS:
${interactionList}

Return only the updated profile text, no JSON or formatting.`;

  const result = await runClaudeCode({ prompt, allowedTools: [], timeoutMs: 90_000 });
  return result.trim() || currentProfile;
}
