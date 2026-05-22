import { describe, it, expect } from "vitest";
import {
  canonicalizePairingCode,
  formatPairingCode,
  generatePairingCode,
  sha256,
} from "../../lib/pairing-code.js";
import { clampPairingTtl, PAIRING_TTL_MAX_MS, PAIRING_TTL_MS } from "../device-pairing.js";

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

describe("clampPairingTtl", () => {
  it("defaults to PAIRING_TTL_MS when undefined", () => {
    expect(clampPairingTtl(undefined)).toBe(PAIRING_TTL_MS);
  });

  it("returns the requested value when inside the range", () => {
    const oneHour = 60 * 60 * 1000;
    expect(clampPairingTtl(oneHour)).toBe(oneHour);
  });

  it("clamps requests below the default floor up to PAIRING_TTL_MS", () => {
    expect(clampPairingTtl(1000)).toBe(PAIRING_TTL_MS);
    expect(clampPairingTtl(0)).toBe(PAIRING_TTL_MS);
  });

  it("clamps requests above the max down to PAIRING_TTL_MAX_MS (long-lived cap)", () => {
    const oneYear = 365 * 24 * 60 * 60 * 1000;
    expect(clampPairingTtl(oneYear)).toBe(PAIRING_TTL_MAX_MS);
  });

  it("exact 7 days is accepted as-is (boundary)", () => {
    expect(clampPairingTtl(PAIRING_TTL_MAX_MS)).toBe(PAIRING_TTL_MAX_MS);
  });

  it("PAIRING_TTL_MAX_MS is 7 days, default is 10 minutes", () => {
    expect(PAIRING_TTL_MS).toBe(10 * 60 * 1000);
    expect(PAIRING_TTL_MAX_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
