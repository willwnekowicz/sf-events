export function computeFinalScore(
  relevanceScore: number | null,
  distanceMiles: number | null,
  eventDate: string,
  today: string
): number {
  const relevance = relevanceScore ?? 50;
  const distance = Math.min(distanceMiles ?? 0, 15);
  const distancePenalty = Math.floor(distance);

  const eventMs = new Date(eventDate).getTime();
  const todayMs = new Date(today).getTime();
  const daysAway = Math.round((eventMs - todayMs) / (1000 * 60 * 60 * 24));

  let recencyBoost = 0;
  if (daysAway <= 0) recencyBoost = 10;
  else if (daysAway === 1) recencyBoost = 8;
  else if (daysAway === 2) recencyBoost = 6;
  else if (daysAway <= 4) recencyBoost = 4;
  else if (daysAway <= 7) recencyBoost = 2;

  return relevance - distancePenalty + recencyBoost;
}
