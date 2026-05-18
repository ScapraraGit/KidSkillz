import { describe, it, expect } from "vitest";
import { evaluatePinAttempt, isLocked, backoffMs } from "../child-auth.js";

const t0 = new Date("2026-01-01T00:00:00Z");

describe("backoffMs", () => {
  it("returns null below threshold", () => {
    expect(backoffMs(0)).toBeNull();
    expect(backoffMs(4)).toBeNull();
  });

  it("escalates 1m -> 5m -> 30m -> 24h", () => {
    expect(backoffMs(5)).toBe(60_000);
    expect(backoffMs(6)).toBe(5 * 60_000);
    expect(backoffMs(7)).toBe(30 * 60_000);
    expect(backoffMs(8)).toBe(24 * 60 * 60_000);
    expect(backoffMs(20)).toBe(24 * 60 * 60_000);
  });
});

describe("evaluatePinAttempt", () => {
  it("success resets counter and clears lock", () => {
    const r = evaluatePinAttempt(
      { failedPinAttempts: 4, pinLockedUntil: new Date(t0.getTime() + 60_000) },
      true,
      t0,
    );
    expect(r).toEqual({ failedPinAttempts: 0, pinLockedUntil: null, locked: false });
  });

  it("failure under threshold increments without lock", () => {
    const r = evaluatePinAttempt({ failedPinAttempts: 2, pinLockedUntil: null }, false, t0);
    expect(r.failedPinAttempts).toBe(3);
    expect(r.pinLockedUntil).toBeNull();
    expect(r.locked).toBe(false);
  });

  it("5th failure locks for 1 minute", () => {
    const r = evaluatePinAttempt({ failedPinAttempts: 4, pinLockedUntil: null }, false, t0);
    expect(r.failedPinAttempts).toBe(5);
    expect(r.locked).toBe(true);
    expect(r.pinLockedUntil?.getTime()).toBe(t0.getTime() + 60_000);
  });

  it("8th+ failure locks for 24h", () => {
    const r = evaluatePinAttempt({ failedPinAttempts: 7, pinLockedUntil: null }, false, t0);
    expect(r.pinLockedUntil?.getTime()).toBe(t0.getTime() + 24 * 60 * 60_000);
  });
});

describe("isLocked", () => {
  it("true while pinLockedUntil > now", () => {
    expect(isLocked({ failedPinAttempts: 5, pinLockedUntil: new Date(t0.getTime() + 1) }, t0)).toBe(true);
  });
  it("false once expired", () => {
    expect(isLocked({ failedPinAttempts: 5, pinLockedUntil: new Date(t0.getTime() - 1) }, t0)).toBe(false);
  });
  it("false when null", () => {
    expect(isLocked({ failedPinAttempts: 0, pinLockedUntil: null }, t0)).toBe(false);
  });
});
