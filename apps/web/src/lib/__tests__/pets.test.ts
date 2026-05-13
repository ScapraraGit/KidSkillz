import { describe, it, expect } from "vitest";
import { petStageForLevel, getPet, petGlyph, PETS } from "../pets";

describe("petStageForLevel", () => {
  it("L1-L2 = egg (0)", () => {
    expect(petStageForLevel(1)).toBe(0);
    expect(petStageForLevel(2)).toBe(0);
  });
  it("L3-L5 = hatchling (1)", () => {
    expect(petStageForLevel(3)).toBe(1);
    expect(petStageForLevel(5)).toBe(1);
  });
  it("L6-L10 = adult (2)", () => {
    expect(petStageForLevel(6)).toBe(2);
    expect(petStageForLevel(10)).toBe(2);
  });
  it("L11+ = champion (3)", () => {
    expect(petStageForLevel(11)).toBe(3);
    expect(petStageForLevel(100)).toBe(3);
  });
});

describe("getPet", () => {
  it("returns matching pet by id", () => {
    expect(getPet("cat").label).toBe("Cat");
  });
  it("falls back to first pet for unknown id", () => {
    expect(getPet("unknown").id).toBe(PETS[0].id);
  });
  it("returns first pet for null/undefined", () => {
    expect(getPet(null).id).toBe(PETS[0].id);
    expect(getPet(undefined).id).toBe(PETS[0].id);
  });
});

describe("petGlyph", () => {
  it("returns evolution glyph for level", () => {
    const drag = getPet("dragon");
    expect(petGlyph("dragon", 1)).toBe(drag.stages[0]);
    expect(petGlyph("dragon", 3)).toBe(drag.stages[1]);
    expect(petGlyph("dragon", 11)).toBe(drag.stages[3]);
  });
});
