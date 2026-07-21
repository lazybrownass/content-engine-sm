import { describe, expect, it } from "vitest";

import { computeRelevancePercentages } from "@/lib/knowledge/relevance";

describe("computeRelevancePercentages", () => {
  it("returns [] for an empty input", () => {
    expect(computeRelevancePercentages([])).toEqual([]);
  });

  it("min-max normalizes to a 0-100 range", () => {
    expect(computeRelevancePercentages([1, 3, 5])).toEqual([0, 50, 100]);
  });

  it("returns 100 for every score when all scores are equal", () => {
    expect(computeRelevancePercentages([2, 2, 2])).toEqual([100, 100, 100]);
  });

  it("returns 100 for a single score", () => {
    expect(computeRelevancePercentages([7])).toEqual([100]);
  });

  it("handles negative logit-range scores", () => {
    expect(computeRelevancePercentages([-2, 0, 2])).toEqual([0, 50, 100]);
  });

  it("preserves input order", () => {
    expect(computeRelevancePercentages([5, 1, 3])).toEqual([100, 0, 50]);
  });
});
