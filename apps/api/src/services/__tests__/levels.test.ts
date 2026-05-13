import { describe, it, expect } from "vitest";
import { xpForLevel, levelForXp, computeLevel } from "../levels.js";

describe("xpForLevel", () => {
  it("L1 is 0", () => {
    expect(xpForLevel(1)).toBe(0);
  });

  it("matches quadratic formula 25*L*(L-1)", () => {
    expect(xpForLevel(2)).toBe(50);
    expect(xpForLevel(3)).toBe(150);
    expect(xpForLevel(4)).toBe(300);
    expect(xpForLevel(5)).toBe(500);
    expect(xpForLevel(10)).toBe(2250);
    expect(xpForLevel(20)).toBe(9500);
  });

  it("levels below 1 clamp to 0", () => {
    expect(xpForLevel(0)).toBe(0);
    expect(xpForLevel(-3)).toBe(0);
  });
});

describe("levelForXp", () => {
  it("xp 0 = level 1", () => {
    expect(levelForXp(0)).toBe(1);
  });

  it("xp just under level threshold stays at previous level", () => {
    expect(levelForXp(49)).toBe(1);
    expect(levelForXp(149)).toBe(2);
    expect(levelForXp(299)).toBe(3);
  });

  it("xp exactly at threshold advances level", () => {
    expect(levelForXp(50)).toBe(2);
    expect(levelForXp(150)).toBe(3);
    expect(levelForXp(500)).toBe(5);
    expect(levelForXp(2250)).toBe(10);
  });

  it("handles very large xp without infinite loop", () => {
    expect(levelForXp(1_000_000)).toBeGreaterThan(100);
  });
});

describe("computeLevel", () => {
  it("includes progress within current level", () => {
    const r = computeLevel(75); // L2 floor=50, L3 floor=150
    expect(r.level).toBe(2);
    expect(r.xp).toBe(75);
    expect(r.xpInLevel).toBe(25);
    expect(r.xpToNext).toBe(100);
  });

  it("at exact level boundary, xpInLevel is 0", () => {
    const r = computeLevel(150);
    expect(r.level).toBe(3);
    expect(r.xpInLevel).toBe(0);
    expect(r.xpToNext).toBe(150); // L4(300) - L3(150)
  });

  it("at xp 0 returns L1 with full xpToNext", () => {
    const r = computeLevel(0);
    expect(r.level).toBe(1);
    expect(r.xpInLevel).toBe(0);
    expect(r.xpToNext).toBe(50);
  });
});
