import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearLastFamily, getLastFamily, normalizeFamilyCode, setLastFamily } from "../lastFamily";

const KEY = "cc:lastFamily";

beforeEach(() => localStorage.clear());
afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe("lastFamily storage", () => {
  it("getLastFamily returns null when nothing is stored", () => {
    expect(getLastFamily()).toBeNull();
  });

  it("set + get round-trips name and code", () => {
    setLastFamily("The Smiths", "ABC123");
    const r = getLastFamily();
    expect(r?.name).toBe("The Smiths");
    expect(r?.code).toBe("ABC123");
    expect(typeof r?.savedAt).toBe("number");
  });

  it("clearLastFamily removes the entry", () => {
    setLastFamily("X", "YYYYYY");
    clearLastFamily();
    expect(getLastFamily()).toBeNull();
  });

  it("expires entries older than 90 days", () => {
    const ninetyOneDaysAgo = Date.now() - 91 * 24 * 60 * 60 * 1000;
    localStorage.setItem(KEY, JSON.stringify({ name: "Old", code: "OLD123", savedAt: ninetyOneDaysAgo }));
    expect(getLastFamily()).toBeNull();
    // Stale entry is GC'd on read.
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("returns null on malformed JSON instead of throwing", () => {
    localStorage.setItem(KEY, "{not json");
    expect(getLastFamily()).toBeNull();
  });

  it("returns null when the stored object is missing required fields", () => {
    localStorage.setItem(KEY, JSON.stringify({ name: "Only", savedAt: Date.now() }));
    expect(getLastFamily()).toBeNull();
  });
});

describe("normalizeFamilyCode", () => {
  it("uppercases lowercase input", () => {
    expect(normalizeFamilyCode("abcdef")).toBe("ABCDEF");
  });

  it("strips spaces and punctuation", () => {
    expect(normalizeFamilyCode("ab-cd ef")).toBe("ABCDEF");
    expect(normalizeFamilyCode("ab cd 3f")).toBe("ABCD3F");
  });

  it("truncates at 6 characters", () => {
    expect(normalizeFamilyCode("ABCDEFGHIJ")).toBe("ABCDEF");
  });

  it("returns empty string when no valid chars remain", () => {
    expect(normalizeFamilyCode("---***")).toBe("");
  });

  it("accepts existing-format codes containing chars dropped from generation alphabet", () => {
    // Server-side restricted alphabet excludes B/8/U/V/0/O/1/I/L from new
    // codes, but the input filter must still accept them so legacy codes
    // generated under the old alphabet keep working.
    expect(normalizeFamilyCode("b8uv01")).toBe("B8UV01");
  });
});
