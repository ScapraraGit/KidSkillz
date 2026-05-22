import { describe, it, expect } from "vitest";
import {
  deriveTags,
  feedbackPayloadSchema,
  submitFeedbackInputSchema,
  updateChecklistInputSchema,
  checklistKeys,
} from "../beta.js";

describe("feedbackPayloadSchema", () => {
  it("accepts a minimal payload with just overall rating + recommend", () => {
    const result = feedbackPayloadSchema.safeParse({
      ratings: { overall: 4 },
      recommend: "YES",
    });
    expect(result.success).toBe(true);
  });

  it("rejects ratings out of 1..5 range", () => {
    const result = feedbackPayloadSchema.safeParse({
      ratings: { overall: 6 },
      recommend: "MAYBE",
    });
    expect(result.success).toBe(false);
  });

  it("requires recommend", () => {
    const result = feedbackPayloadSchema.safeParse({ ratings: { overall: 3 } });
    expect(result.success).toBe(false);
  });

  it("accepts empty-string email (form leftovers) without erroring", () => {
    const result = feedbackPayloadSchema.safeParse({
      testerInfo: { email: "" },
      ratings: { overall: 3 },
      recommend: "MAYBE",
    });
    expect(result.success).toBe(true);
  });

  it("caps free-text fields at 2000 chars", () => {
    const tooLong = "x".repeat(2001);
    const result = feedbackPayloadSchema.safeParse({
      ratings: { overall: 3 },
      recommend: "YES",
      openEnded: { bugs: tooLong },
    });
    expect(result.success).toBe(false);
  });
});

describe("submitFeedbackInputSchema", () => {
  it("accepts payload + optional userAgent", () => {
    const r = submitFeedbackInputSchema.safeParse({
      payload: { ratings: { overall: 5 }, recommend: "YES" },
      userAgent: "Mozilla/5.0",
    });
    expect(r.success).toBe(true);
  });
});

describe("deriveTags", () => {
  const base = {
    testerInfo: {},
    device: {},
    ratings: { overall: 3 },
    openEnded: {},
    recommend: "MAYBE" as const,
  };

  it("tags bug when bugs field has text", () => {
    expect(deriveTags({ ...base, openEnded: { bugs: "thing crashed" } })).toContain("bug");
  });

  it("tags high_rating at >=4 and low_rating at <=2", () => {
    expect(deriveTags({ ...base, ratings: { overall: 5 } })).toContain("high_rating");
    expect(deriveTags({ ...base, ratings: { overall: 1 } })).toContain("low_rating");
  });

  it("tags would_not_recommend when recommend is NO", () => {
    expect(deriveTags({ ...base, recommend: "NO" })).toContain("would_not_recommend");
  });

  it("ignores blank-only free-text", () => {
    const tags = deriveTags({ ...base, openEnded: { bugs: "   " } });
    expect(tags).not.toContain("bug");
  });

  it("returns no overlapping duplicates", () => {
    const tags = deriveTags({
      ...base,
      ratings: { overall: 5 },
      openEnded: { workedWell: "great", featureRequest: "more" },
    });
    expect(new Set(tags).size).toBe(tags.length);
  });
});

describe("updateChecklistInputSchema", () => {
  it("accepts known checklist keys", () => {
    const r = updateChecklistInputSchema.safeParse({
      completed: [checklistKeys[0], checklistKeys[1]],
    });
    expect(r.success).toBe(true);
  });

  it("rejects unknown keys", () => {
    const r = updateChecklistInputSchema.safeParse({ completed: ["not_a_key"] });
    expect(r.success).toBe(false);
  });
});
