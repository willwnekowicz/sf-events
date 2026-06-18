import { runClaudeCode, extractJsonObject } from "./code-cli";

interface InteractionLite {
  action: string;
  eventTitle: string;
  note?: string | null;
}

export interface Interests {
  likes: string[];
  dislikes: string[];
}

/**
 * Extract short topic tags (what the user is INTO vs NOT into) from their
 * preference profile + recent reactions. Themes/vibes, not event names.
 */
export async function extractInterests(
  profileText: string,
  interactions: InteractionLite[]
): Promise<Interests> {
  const reactions = interactions
    .map(
      (i) =>
        `${i.action === "thumbs_up" ? "LIKED" : i.action === "thumbs_down" ? "DISLIKED" : "SAVED"}: ` +
        `"${i.eventTitle}"${i.note ? ` — "${i.note}"` : ""}`
    )
    .join("\n");

  const prompt = `From this user's event preference profile and their reactions, extract short topic tags describing what they're INTO and what they're NOT into. Tags must be concise (1-3 words) about themes/topics/vibes (e.g. "AI", "live comedy", "startups", "sports", "early mornings", "jazz") — NOT specific event names or venues.

PROFILE:
${profileText || "(none yet)"}

REACTIONS:
${reactions || "(none yet)"}

Return ONLY JSON: {"likes": ["..."], "dislikes": ["..."]}. Up to 10 each, lowercase, no duplicates. No prose, no markdown.`;

  try {
    const result = await runClaudeCode({ prompt, allowedTools: [], timeoutMs: 60_000 });
    const parsed = extractJsonObject<Interests>(result);
    const clean = (arr: unknown): string[] =>
      Array.isArray(arr) ? Array.from(new Set(arr.map((t) => String(t).trim().toLowerCase()).filter(Boolean))).slice(0, 12) : [];
    return { likes: clean(parsed?.likes), dislikes: clean(parsed?.dislikes) };
  } catch (err) {
    console.error("[interests] extraction failed:", err);
    return { likes: [], dislikes: [] };
  }
}
