import { describe, it, expect } from "vitest";
import { computeTeamSplit } from "../../lib/team-split.js";

describe("computeTeamSplit", () => {
  it("returns empty list when no recipients", () => {
    expect(computeTeamSplit(10, [], "EVEN")).toEqual([]);
    expect(computeTeamSplit(10, [], "FULL")).toEqual([]);
  });

  it("FULL awards full credit to every recipient", () => {
    expect(computeTeamSplit(10, ["a", "b", "c"], "FULL")).toEqual([
      { childId: "a", amount: 10 },
      { childId: "b", amount: 10 },
      { childId: "c", amount: 10 },
    ]);
  });

  it("EVEN divides evenly when credits divide cleanly", () => {
    expect(computeTeamSplit(12, ["a", "b", "c"], "EVEN")).toEqual([
      { childId: "a", amount: 4 },
      { childId: "b", amount: 4 },
      { childId: "c", amount: 4 },
    ]);
  });

  it("EVEN ceilings remainder so total >= base (kids favored)", () => {
    // 10 / 3 = 3.33 → 4 each → 12 total (2 over base, intentional)
    const r = computeTeamSplit(10, ["a", "b", "c"], "EVEN");
    expect(r.every((x) => x.amount === 4)).toBe(true);
    const total = r.reduce((s, x) => s + x.amount, 0);
    expect(total).toBeGreaterThanOrEqual(10);
  });

  it("EVEN with single recipient gives the full pot", () => {
    expect(computeTeamSplit(7, ["solo"], "EVEN")).toEqual([{ childId: "solo", amount: 7 }]);
  });

  it("handles zero credits without dividing by zero", () => {
    expect(computeTeamSplit(0, ["a", "b"], "EVEN")).toEqual([
      { childId: "a", amount: 0 },
      { childId: "b", amount: 0 },
    ]);
  });
});
