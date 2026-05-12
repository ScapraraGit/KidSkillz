import { describe, it, expect } from "vitest";
import { formatInTimeZone } from "date-fns-tz";
import { computeDeadline, computeSuggestedAward } from "../awards.js";
import type { FamilySettings } from "@chorechamps/shared";

const baseSettings: FamilySettings = {
  timezone: "America/New_York",
  allowNegativeBalance: false,
  defaultProofRequirement: "NONE",
  initiativeBonus: { plannedFlatBonus: 0, plannedMultiplier: 1 },
  latePenalty: {
    enabled: true,
    graceMinutes: 15,
    latePercent: 0.5,
    lateMultiplier: 4,
    creditFloor: 1,
  },
} as unknown as FamilySettings;

const TZ = "America/New_York";

describe("computeDeadline", () => {
  it("returns dueAt for ONE_TIME tasks", () => {
    const due = new Date("2026-05-01T12:00:00Z");
    const d = computeDeadline(
      { kind: "ONE_TIME", creditValue: 10, dueAt: due, dueByTime: null },
      null,
      TZ,
    );
    expect(d?.toISOString()).toBe(due.toISOString());
  });

  it("returns null when ONE_TIME has no dueAt", () => {
    const d = computeDeadline(
      { kind: "ONE_TIME", creditValue: 10, dueAt: null, dueByTime: null },
      null,
      TZ,
    );
    expect(d).toBeNull();
  });

  it("produces a deadline for RECURRING with dueByTime on the right calendar day in family TZ", () => {
    const d = computeDeadline(
      { kind: "RECURRING", creditValue: 10, dueAt: null, dueByTime: "17:00" },
      "2026-05-12",
      TZ,
    );
    expect(d).not.toBeNull();
    expect(formatInTimeZone(d!, TZ, "yyyy-MM-dd")).toBe("2026-05-12");
  });

  it("returns null for malformed dueByTime", () => {
    const d = computeDeadline(
      { kind: "RECURRING", creditValue: 10, dueAt: null, dueByTime: "25:99" },
      "2026-05-12",
      TZ,
    );
    expect(d).toBeNull();
  });
});

function recurringAt(submittedDelayMin: number) {
  const task = { kind: "RECURRING" as const, creditValue: 10, dueAt: null, dueByTime: "17:00" };
  const deadline = computeDeadline(task, "2026-05-12", TZ)!;
  return {
    task,
    occurrenceDate: "2026-05-12",
    submittedAt: new Date(deadline.getTime() + submittedDelayMin * 60_000),
    settings: baseSettings,
  };
}

describe("computeSuggestedAward", () => {
  it("ON_TIME within grace window awards full credit", () => {
    const r = computeSuggestedAward(recurringAt(10)); // 10 min late, grace=15
    expect(r.tier).toBe("ON_TIME");
    expect(r.credits).toBe(10);
  });

  it("LATE tier applies latePercent with creditFloor", () => {
    const r = computeSuggestedAward(recurringAt(30)); // > grace, within lateZoneEnd (15*4=60)
    expect(r.tier).toBe("LATE");
    expect(r.credits).toBe(5); // floor(10 * 0.5)
  });

  it("SEVERE tier collapses to creditFloor", () => {
    const r = computeSuggestedAward(recurringAt(60 * 24)); // far past
    expect(r.tier).toBe("SEVERE");
    expect(r.credits).toBe(1);
  });

  it("disabled latePenalty always awards full credit but reports lateMinutes", () => {
    const s = { ...baseSettings, latePenalty: { ...baseSettings.latePenalty, enabled: false } };
    const r = computeSuggestedAward({ ...recurringAt(60 * 24), settings: s as FamilySettings });
    expect(r.credits).toBe(10);
    expect(r.tier).toBe("ON_TIME");
    expect(r.lateMinutes).toBeGreaterThan(0);
  });

  it("no deadline => full credit, null deadline in result", () => {
    const r = computeSuggestedAward({
      task: { kind: "ONE_TIME", creditValue: 7, dueAt: null, dueByTime: null },
      occurrenceDate: null,
      submittedAt: new Date(),
      settings: baseSettings,
    });
    expect(r.credits).toBe(7);
    expect(r.deadline).toBeNull();
  });
});
