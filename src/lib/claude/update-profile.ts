import { getClaudeClient } from "./client";

interface InteractionRecord {
  action: string;
  eventTitle: string;
  eventDescription: string | null;
  eventVenue: string;
}

export async function regenerateProfile(
  currentProfile: string,
  interactions: InteractionRecord[]
): Promise<string> {
  if (interactions.length === 0) return currentProfile;

  const client = getClaudeClient();

  const interactionList = interactions
    .map(
      (i) =>
        `${i.action === "thumbs_up" ? "LIKED" : i.action === "thumbs_down" ? "DISLIKED" : "ADDED TO CALENDAR"}: "${i.eventTitle}" at ${i.eventVenue}${i.eventDescription ? ` — ${i.eventDescription}` : ""}`
    )
    .join("\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Update this user preference profile based on their recent event interactions. Keep the same natural language style. Incorporate what the new interactions tell us about their tastes. Don't remove existing preferences unless directly contradicted.\n\nCURRENT PROFILE:\n${currentProfile}\n\nRECENT INTERACTIONS:\n${interactionList}\n\nReturn only the updated profile text, no JSON or formatting.`,
      },
    ],
  });

  for (const block of response.content) {
    if (block.type === "text") {
      return block.text.trim();
    }
  }

  return currentProfile;
}
