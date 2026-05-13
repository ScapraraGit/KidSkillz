import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearTimer,
  formatMmSs,
  isExpired,
  loadTimer,
  saveTimer,
  timeLeftMs,
  type ActiveTimer,
} from "../activeTimer";

const KID = "kid-1";

function fixture(over: Partial<ActiveTimer> = {}): ActiveTimer {
  return {
    taskId: "task-1",
    taskTitle: "Dishes",
    startedAt: Date.now(),
    durationMs: 10 * 60_000,
    childId: KID,
    ...over,
  };
}

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("activeTimer storage", () => {
  it("loadTimer returns null when nothing saved", () => {
    expect(loadTimer(KID)).toBeNull();
  });

  it("round-trips through saveTimer", () => {
    const t = fixture();
    saveTimer(t);
    expect(loadTimer(KID)).toEqual(t);
  });

  it("returns null for a different child (scope guard)", () => {
    saveTimer(fixture({ childId: "kid-2" }));
    expect(loadTimer(KID)).toBeNull();
  });

  it("returns null on malformed JSON", () => {
    localStorage.setItem("cc:activeTimer", "{not json");
    expect(loadTimer(KID)).toBeNull();
  });

  it("returns null on missing required keys", () => {
    localStorage.setItem("cc:activeTimer", JSON.stringify({ taskId: "x" }));
    expect(loadTimer(KID)).toBeNull();
  });

  it("clearTimer removes the entry", () => {
    saveTimer(fixture());
    clearTimer();
    expect(loadTimer(KID)).toBeNull();
  });
});

describe("timeLeftMs / isExpired", () => {
  it("equals durationMs at startedAt", () => {
    const start = 1_000;
    const t = fixture({ startedAt: start, durationMs: 60_000 });
    expect(timeLeftMs(t, start)).toBe(60_000);
    expect(isExpired(t, start)).toBe(false);
  });

  it("counts down linearly", () => {
    const t = fixture({ startedAt: 0, durationMs: 60_000 });
    expect(timeLeftMs(t, 30_000)).toBe(30_000);
  });

  it("clamps at zero and reports expired", () => {
    const t = fixture({ startedAt: 0, durationMs: 60_000 });
    expect(timeLeftMs(t, 120_000)).toBe(0);
    expect(isExpired(t, 120_000)).toBe(true);
  });
});

describe("formatMmSs", () => {
  it("formats minutes and seconds", () => {
    expect(formatMmSs(0)).toBe("0:00");
    expect(formatMmSs(5_000)).toBe("0:05");
    expect(formatMmSs(65_000)).toBe("1:05");
    expect(formatMmSs(10 * 60_000)).toBe("10:00");
  });

  it("clamps negatives", () => {
    expect(formatMmSs(-1)).toBe("0:00");
  });
});
