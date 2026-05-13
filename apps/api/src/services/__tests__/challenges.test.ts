import { describe, it, expect } from "vitest";
import { periodKeyFor } from "../challenges.js";

describe("periodKeyFor", () => {
  it("DAY returns YYYY-MM-DD in family TZ", () => {
    // 2026-05-12 03:00 UTC = 2026-05-11 23:00 in America/New_York (DST)
    const t = new Date("2026-05-12T03:00:00Z");
    expect(periodKeyFor("DAY", "America/New_York", t)).toBe("2026-05-11");
    expect(periodKeyFor("DAY", "UTC", t)).toBe("2026-05-12");
  });

  it("WEEK returns YYYY-Www ISO week in family TZ", () => {
    // 2026-05-12 (Tuesday) is in ISO week 20 of 2026.
    const t = new Date("2026-05-12T12:00:00Z");
    expect(periodKeyFor("WEEK", "UTC", t)).toBe("2026-W20");
  });

  it("WEEK handles ISO week-year boundary correctly", () => {
    // 2027-01-01 is a Friday — belongs to ISO week 53 of 2026.
    const t = new Date("2027-01-01T12:00:00Z");
    expect(periodKeyFor("WEEK", "UTC", t)).toBe("2026-W53");
  });

  it("DAY rolls over at local midnight, not UTC midnight", () => {
    // 2026-05-12 06:30 UTC = 2026-05-11 23:30 in America/Phoenix (no DST, UTC-7).
    const t = new Date("2026-05-12T06:30:00Z");
    expect(periodKeyFor("DAY", "America/Phoenix", t)).toBe("2026-05-11");
    // 1 hour later it's the next local day.
    const t2 = new Date("2026-05-12T07:30:00Z");
    expect(periodKeyFor("DAY", "America/Phoenix", t2)).toBe("2026-05-12");
  });
});
