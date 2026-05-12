import { describe, it, expect } from "vitest";
import { todayInTz, dowSunFirst, dateRangeForTodayPlus } from "../time.js";

describe("time helpers", () => {
  it("todayInTz formats YYYY-MM-DD in the given zone", () => {
    // 2026-05-12 03:00 UTC == 2026-05-11 23:00 in NY (EDT)
    const out = todayInTz("America/New_York", new Date("2026-05-12T03:00:00Z"));
    expect(out).toBe("2026-05-11");
  });

  it("dowSunFirst returns 0..6 with Sunday=0", () => {
    // 2026-05-10 is a Sunday
    expect(dowSunFirst("UTC", "2026-05-10")).toBe(0);
    // 2026-05-12 Tuesday
    expect(dowSunFirst("UTC", "2026-05-12")).toBe(2);
    // 2026-05-16 Saturday
    expect(dowSunFirst("UTC", "2026-05-16")).toBe(6);
  });

  it("dateRangeForTodayPlus emits N consecutive dates", () => {
    const r = dateRangeForTodayPlus("UTC", 3, new Date("2026-05-12T12:00:00Z"));
    expect(r).toEqual(["2026-05-12", "2026-05-13", "2026-05-14"]);
  });
});
