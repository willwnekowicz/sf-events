import { computeFinalScore } from "../scoring";

describe("computeFinalScore", () => {
  const today = "2026-03-09";

  it("returns relevance score with no distance and same-day boost", () => {
    const result = computeFinalScore(80, 0, today, today);
    expect(result).toBe(90);
  });

  it("applies distance penalty of 1 per mile capped at 15", () => {
    const result = computeFinalScore(80, 20, today, today);
    expect(result).toBe(75);
  });

  it("applies tomorrow recency boost of 8", () => {
    const result = computeFinalScore(80, 0, "2026-03-10", today);
    expect(result).toBe(88);
  });

  it("applies 2-day recency boost of 6", () => {
    const result = computeFinalScore(80, 0, "2026-03-11", today);
    expect(result).toBe(86);
  });

  it("applies 3-4 day recency boost of 4", () => {
    const result = computeFinalScore(80, 0, "2026-03-12", today);
    expect(result).toBe(84);
  });

  it("applies 5-7 day recency boost of 2", () => {
    const result = computeFinalScore(80, 0, "2026-03-14", today);
    expect(result).toBe(82);
  });

  it("applies no recency boost beyond 7 days", () => {
    const result = computeFinalScore(80, 0, "2026-03-17", today);
    expect(result).toBe(80);
  });

  it("handles null relevance score as 50", () => {
    const result = computeFinalScore(null, 0, today, today);
    expect(result).toBe(60);
  });
});
