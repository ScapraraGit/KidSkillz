import { describe, it, expect } from "vitest";
import { formatHoursMinutes, msUntilEndOfDay } from "../timeOfDay";

describe("formatHoursMinutes", () => {
  it("0 ms = 0m", () => {
    expect(formatHoursMinutes(0)).toBe("0m");
  });
  it("under 1h prints minutes only", () => {
    expect(formatHoursMinutes(15 * 60_000)).toBe("15m");
  });
  it("over 1h prints H + M", () => {
    expect(formatHoursMinutes((2 * 60 + 30) * 60_000)).toBe("2h 30m");
  });
  it("clamps negatives to 0m", () => {
    expect(formatHoursMinutes(-5000)).toBe("0m");
  });
});

describe("msUntilEndOfDay", () => {
  it("returns positive < 24h for any time in day", () => {
    const ms = msUntilEndOfDay("America/Phoenix", new Date("2026-05-12T12:00:00Z"));
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(24 * 3600_000);
  });
  it("differs across timezones for same UTC instant", () => {
    const t = new Date("2026-05-12T18:00:00Z");
    const phx = msUntilEndOfDay("America/Phoenix", t);
    const tok = msUntilEndOfDay("Asia/Tokyo", t);
    expect(phx).not.toBe(tok);
  });
});
