import { describe, expect, it } from "vitest";

import {
  computeStyleProfile,
  MIN_SAMPLE_POSTS,
  type StyleSamplePost,
} from "@/features/analytics/style-memory";
import { buildStyleMemoryBlock } from "@/features/generation/prompt";

function makeSamples(count: number, text: string, rate: number | null): StyleSamplePost[] {
  return Array.from({ length: count }, (_, i) => ({ id: `p${i}`, finalText: text, engagementRate: rate }));
}

describe("computeStyleProfile", () => {
  it("returns a baseline profile below the sample threshold", () => {
    const profile = computeStyleProfile(makeSamples(MIN_SAMPLE_POSTS - 1, "Alpha beta gamma.", 0.1));

    expect(profile.avgSentenceLength).toBeNull();
    expect(profile.emojiUsageRate).toBeNull();
    expect(profile.hookPatterns).toEqual([]);
    expect(profile.favoriteVocabulary).toEqual([]);
    expect(profile.winnerPostIds).toEqual([]);
  });

  it("ignores posts without an entered engagement metric", () => {
    // 9 scored + 5 unscored: only 9 count, which is below the threshold → baseline.
    const posts = [
      ...makeSamples(9, "Alpha beta gamma.", 0.1),
      ...makeSamples(5, "Delta epsilon zeta.", null),
    ];

    expect(computeStyleProfile(posts).avgSentenceLength).toBeNull();
  });

  it("computes sentence length and picks the top performers once the threshold is met", () => {
    // Ten identical, scored posts: two 3-word sentences each, no emoji.
    const profile = computeStyleProfile(makeSamples(MIN_SAMPLE_POSTS, "Alpha beta gamma. Delta epsilon zeta.", 0.1));

    expect(profile.avgSentenceLength).toBe(3);
    expect(profile.emojiUsageRate).toBe(0);
    expect(profile.winnerPostIds).toHaveLength(5); // TOP_WINNERS
    // All winners share the same single-line hook, so it dedupes to one pattern.
    expect(profile.hookPatterns).toEqual([
      { pattern: "Alpha beta gamma. Delta epsilon zeta.", frequency: 5 },
    ]);
  });

  it("measures emoji usage per 100 words", () => {
    const profile = computeStyleProfile(makeSamples(MIN_SAMPLE_POSTS, "Hello world 🚀", 0.2));

    // Each post is 3 whitespace tokens with one emoji → 1/3 * 100.
    expect(profile.emojiUsageRate).toBeCloseTo(33.33, 1);
  });

  it("selects the highest-engagement posts as winners", () => {
    const posts: StyleSamplePost[] = Array.from({ length: 12 }, (_, i) => ({
      id: `p${i}`,
      finalText: "Alpha beta gamma. Delta epsilon zeta.",
      engagementRate: i / 100,
    }));

    const profile = computeStyleProfile(posts);

    // Top 5 by engagementRate are p11..p7.
    expect(profile.winnerPostIds.sort()).toEqual(["p10", "p11", "p7", "p8", "p9"].sort());
  });
});

describe("buildStyleMemoryBlock", () => {
  it("returns an empty string for null", () => {
    expect(buildStyleMemoryBlock(null)).toBe("");
  });

  it("returns an empty string when the profile carries no usable signal", () => {
    expect(
      buildStyleMemoryBlock({
        avgSentenceLength: null,
        emojiUsageRate: null,
        hookPatterns: [],
        favoriteVocabulary: [],
        avoidedPhrases: [],
        exampleHooks: [],
      }),
    ).toBe("");
  });

  it("renders the learned style guidance when signal is present", () => {
    const block = buildStyleMemoryBlock({
      avgSentenceLength: 12,
      emojiUsageRate: 0,
      hookPatterns: [{ pattern: "Here is the hook", frequency: 3 }],
      favoriteVocabulary: ["shipping", "leverage"],
      avoidedPhrases: ["at the end of the day"],
      exampleHooks: ["I shipped a thing today"],
    });

    expect(block).toContain("Style memory");
    expect(block).toContain("12 words");
    expect(block).toContain("Here is the hook");
    expect(block).toContain("shipping, leverage");
    expect(block).toContain("at the end of the day");
    expect(block).toContain("I shipped a thing today");
  });
});
