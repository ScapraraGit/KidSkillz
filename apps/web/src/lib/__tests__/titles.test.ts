import { describe, it, expect } from "vitest";
import { titleFor, nextTitle } from "../titles";

describe("titleFor", () => {
  it("L1 has no title yet", () => {
    expect(titleFor(1)).toBeNull();
  });
  it("returns highest unlocked title", () => {
    expect(titleFor(2)).toBe("Helper");
    expect(titleFor(3)).toBe("Chore Cub");
    expect(titleFor(5)).toBe("Chore Champ");
    expect(titleFor(6)).toBe("Chore Champ"); // unchanged until next threshold
    expect(titleFor(10)).toBe("Ledger Legend");
    expect(titleFor(50)).toBe("Grand Champion");
  });
});

describe("nextTitle", () => {
  it("returns next ladder entry above current level", () => {
    expect(nextTitle(1)?.name).toBe("Helper");
    expect(nextTitle(4)?.name).toBe("Chore Champ");
  });
  it("returns null when at top of ladder", () => {
    expect(nextTitle(50)).toBeNull();
  });
});
