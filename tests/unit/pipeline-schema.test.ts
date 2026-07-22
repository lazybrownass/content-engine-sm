import { describe, expect, it } from "vitest";

import {
  draftOutputSchema,
  grillModelOutputSchema,
  inlineEditOutputSchema,
  outlineOutputSchema,
  topicGenerationOutputSchema,
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

function makeSuggestion(overrides: Record<string, unknown> = {}) {
  return {
    title: "Why we ship in public",
    rationale: "Fills a gap in FOUNDER_STORY coverage.",
    pillar: "FOUNDER_STORY",
    sourceKnowledgeIds: ["3fa85f64-5717-4562-b3fc-2c963f66afa6"],
    score: 0.8,
    ...overrides,
  };
}

describe("topicGenerationOutputSchema", () => {
  it("accepts 1-10 valid suggestions", () => {
    const result = topicGenerationOutputSchema.safeParse({ suggestions: [makeSuggestion()] });
    expect(result.success).toBe(true);
  });

  it("rejects an empty suggestions array", () => {
    const result = topicGenerationOutputSchema.safeParse({ suggestions: [] });
    expect(result.success).toBe(false);
  });

  it("rejects more than 10 suggestions", () => {
    const result = topicGenerationOutputSchema.safeParse({
      suggestions: Array.from({ length: 11 }, () => makeSuggestion()),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a suggestion with an invalid pillar", () => {
    const result = topicGenerationOutputSchema.safeParse({
      suggestions: [makeSuggestion({ pillar: "NOT_A_PILLAR" })],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a score outside 0-1", () => {
    const result = topicGenerationOutputSchema.safeParse({
      suggestions: [makeSuggestion({ score: 1.5 })],
    });
    expect(result.success).toBe(false);
  });

  it("defaults sourceKnowledgeIds to an empty array when omitted", () => {
    const suggestion = makeSuggestion();
    delete (suggestion as Record<string, unknown>).sourceKnowledgeIds;
    const result = topicGenerationOutputSchema.safeParse({ suggestions: [suggestion] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.suggestions[0]?.sourceKnowledgeIds).toEqual([]);
    }
  });
});

describe("inlineEditOutputSchema", () => {
  it("accepts a non-empty result", () => {
    const result = inlineEditOutputSchema.safeParse({ result: "Rewritten text." });
    expect(result.success).toBe(true);
  });

  it("rejects an empty result", () => {
    const result = inlineEditOutputSchema.safeParse({ result: "" });
    expect(result.success).toBe(false);
  });
});
