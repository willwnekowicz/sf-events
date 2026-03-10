import { computeDistanceMiles } from "../geocoding";

describe("computeDistanceMiles", () => {
  it("returns 0 for the home location", () => {
    const distance = computeDistanceMiles(37.7725, -122.4175);
    expect(distance).toBeLessThan(0.1);
  });

  it("returns reasonable distance for a known location", () => {
    const distance = computeDistanceMiles(37.7762, -122.4213);
    expect(distance).toBeGreaterThan(0.1);
    expect(distance).toBeLessThan(5);
  });
});
