import { describe, it, expect } from "vitest";
import {
  canonicalizePairingCode,
  formatPairingCode,
  generatePairingCode,
  sha256,
} from "../../lib/pairing-code.js";

describe("generatePairingCode", () => {
  it("returns 8 chars from the safe alphabet", () => {
    for (let i = 0; i < 100; i++) {
      const c = generatePairingCode();
      expect(c).toMatch(/^[A-Z2-9]{8}$/);
      // No ambiguous chars.
      expect(c).not.toMatch(/[OIL01]/);
    }
  });
});

describe("formatPairingCode / canonicalizePairingCode", () => {
  it("formats with mid hyphen", () => {
    expect(formatPairingCode("ABCDEFGH")).toBe("ABCD-EFGH");
  });

  it("strips non-alphanum and uppercases", () => {
    expect(canonicalizePairingCode("abcd-efgh")).toBe("ABCDEFGH");
    expect(canonicalizePairingCode(" ab cd ef gh ")).toBe("ABCDEFGH");
    expect(canonicalizePairingCode("ABCD EFGH")).toBe("ABCDEFGH");
  });
});

describe("sha256", () => {
  it("is deterministic + 64 hex chars", () => {
    const a = sha256("hello");
    const b = sha256("hello");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
