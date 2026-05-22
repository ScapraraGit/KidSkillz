import { describe, it, expect } from "vitest";
import { generateFamilyCode } from "../family.js";

// Visually ambiguous glyphs that MUST be absent from generated codes so
// parents reading off a sticky note (or kids transcribing verbally) don't
// confuse them. Existing codes from before this list shrank stay valid;
// this only constrains future generation.
const BANNED_CHARS = ["0", "1", "B", "I", "L", "O", "U", "V", "8"];

describe("generateFamilyCode", () => {
  it("returns a 6-character string", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateFamilyCode();
      expect(code).toHaveLength(6);
    }
  });

  it("emits only chars from the restricted alphabet", () => {
    // Run enough samples to exercise every alphabet position.
    for (let i = 0; i < 500; i++) {
      const code = generateFamilyCode();
      for (const banned of BANNED_CHARS) {
        expect(code).not.toContain(banned);
      }
      expect(code).toMatch(/^[A-Z2-9]+$/);
    }
  });

  it("does not produce the same code on every call (sanity check)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(generateFamilyCode());
    // 100 samples × 27^6 alphabet — collisions virtually impossible.
    expect(seen.size).toBeGreaterThan(95);
  });
});
