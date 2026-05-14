import { describe, it, expect } from "vitest";
import { parseISO } from "date-fns";
import { computeStreakWithGrace } from "../streak.js";

const NO_VACATION = () => false;

function days(...d: string[]) {
  return new Set(d);
}

describe("computeStreakWithGrace", () => {
  it("counts consecutive completed days", () => {
    const s = computeStreakWithGrace({
      taskDays: days("2026-05-13", "2026-05-12", "2026-05-11"),
      todayCal: parseISO("2026-05-13"),
      isVacationDay: NO_VACATION,
      graceCount: 0,
    });
    expect(s).toBe(3);
  });

  it("does not break on today even when not done", () => {
    const s = computeStreakWithGrace({
      taskDays: days("2026-05-12", "2026-05-11"),
      todayCal: parseISO("2026-05-13"),
      isVacationDay: NO_VACATION,
      graceCount: 0,
    });
    expect(s).toBe(2);
  });

  it("breaks on a missed day with zero grace", () => {
    const s = computeStreakWithGrace({
      taskDays: days("2026-05-13", "2026-05-11", "2026-05-10"),
      todayCal: parseISO("2026-05-13"),
      isVacationDay: NO_VACATION,
      graceCount: 0,
    });
    expect(s).toBe(1);
  });

  it("consumes one grace token to bridge a gap", () => {
    const s = computeStreakWithGrace({
      taskDays: days("2026-05-13", "2026-05-11", "2026-05-10"),
      todayCal: parseISO("2026-05-13"),
      isVacationDay: NO_VACATION,
      graceCount: 1,
    });
    // 13 ✓, 12 missed (grace consumed → counts), 11 ✓, 10 ✓
    expect(s).toBe(4);
  });

  it("burns through multiple grace tokens until run breaks", () => {
    const s = computeStreakWithGrace({
      taskDays: days("2026-05-13", "2026-05-10"),
      todayCal: parseISO("2026-05-13"),
      isVacationDay: NO_VACATION,
      graceCount: 2,
    });
    // 13 ✓, 12 grace, 11 grace, 10 ✓, then 9 missed with no grace left → stop
    expect(s).toBe(4);
  });

  it("vacation days do not consume grace tokens", () => {
    const isVac = (d: string) => d === "2026-05-12";
    const s = computeStreakWithGrace({
      taskDays: days("2026-05-13", "2026-05-11"),
      todayCal: parseISO("2026-05-13"),
      isVacationDay: isVac,
      graceCount: 1,
    });
    // 13 ✓, 12 vacation (skipped free), 11 ✓, 10 missed (grace absorbs) → 3
    expect(s).toBe(3);
  });

  it("zero grace + no vacation breaks on the first missed day", () => {
    const isVac = (d: string) => d === "2026-05-12";
    const s = computeStreakWithGrace({
      taskDays: days("2026-05-13", "2026-05-11"),
      todayCal: parseISO("2026-05-13"),
      isVacationDay: isVac,
      graceCount: 0,
    });
    // 13 ✓, 12 vacation (skip), 11 ✓, 10 missed (no grace) → 2
    expect(s).toBe(2);
  });

  it("stops at maxLookback", () => {
    // Build a long run of days, but cap the walk early.
    const set = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const d = new Date("2026-05-13T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - i);
      set.add(d.toISOString().slice(0, 10));
    }
    const s = computeStreakWithGrace({
      taskDays: set,
      todayCal: parseISO("2026-05-13"),
      isVacationDay: NO_VACATION,
      graceCount: 0,
      maxLookback: 5,
    });
    expect(s).toBe(5);
  });
});
