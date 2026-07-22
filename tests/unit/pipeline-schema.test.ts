import { describe, expect, it } from "vitest";

import {
  draftOutputSchema,
  grillModelOutputSchema,
  outlineOutputSchema,
} from "@/features/pipeline/schema";

describe("outlineOutputSchema", () => {
  it("accepts a valid outline with 2-8 sections", () => {
    const result = outlineOutputSchema.safeParse({ sections: ["Hook", "Body", "CTA"] });
    expect(result.success).toBe(true);
  });

  it("rejects fewer than 2 sections", () => {
    const result = outlineOutputSchema.safeParse({ sections: ["Only one"] });
    expect(result.success).toBe(false);
  });

  it("rejects more than 8 sections", () => {
    const result = outlineOutputSchema.safeParse({
      sections: Array.from({ length: 9 }, (_, i) => `Section ${i}`),
    });
    expect(result.success).toBe(false);
  });
});

describe("draftOutputSchema", () => {
  it("accepts a valid draft", () => {
    const result = draftOutputSchema.safeParse({ content: "Full post content." });
    expect(result.success).toBe(true);
  });

  it("rejects a missing content field", () => {
    const result = draftOutputSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("grillModelOutputSchema", () => {
  it("accepts a valid score and violations list", () => {
    const result = grillModelOutputSchema.safeParse({
      qualityScore: 90,
      violations: [],
    });
    expect(result.success).toBe(true);
  });

  it("defaults violations to an empty array when omitted", () => {
    const result = grillModelOutputSchema.safeParse({ qualityScore: 90 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.violations).toEqual([]);
    }
  });

  it("rejects a qualityScore above 100", () => {
    const result = grillModelOutputSchema.safeParse({ qualityScore: 150, violations: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a negative qualityScore", () => {
    const result = grillModelOutputSchema.safeParse({ qualityScore: -1, violations: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer qualityScore", () => {
    const result = grillModelOutputSchema.safeParse({ qualityScore: 50.5, violations: [] });
    expect(result.success).toBe(false);
  });
});
