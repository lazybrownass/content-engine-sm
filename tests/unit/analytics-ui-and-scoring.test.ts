import { describe, expect, it } from "vitest";

import {
  applyPillarScoreBoost,
  MAX_SCORE_DELTA,
  CONFIDENCE_SAMPLE_CAP,
} from "@/features/analytics/pillar-scoring";
import type { TopicSuggestion } from "@/features/pipeline/schema";

function makeSuggestion(overrides: Partial<TopicSuggestion> = {}): TopicSuggestion {
  return {
    title: "A topic",
    rationale: "Because.",
    pillar: "CASE_STUDY",
    sourceKnowledgeIds: [],
    score: 0.5,
    ...overrides,
  };
}

describe("applyPillarScoreBoost", () => {
  it("is a no-op when pillarPerformance carries no signal", () => {
    const suggestions = [makeSuggestion({ score: 0.5 })];
    const result = applyPillarScoreBoost(suggestions, {});
    expect(result).toEqual(suggestions);
  });

  it("is a no-op for a suggestion whose pillar has no historical entry", () => {
    const suggestions = [makeSuggestion({ pillar: "FOUNDER_STORY", score: 0.5 })];
    const pillarPerformance = {
      CASE_STUDY: { avgEngagementRate: 0.1, sampleCount: CONFIDENCE_SAMPLE_CAP },
    };
    const result = applyPillarScoreBoost(suggestions, pillarPerformance);
    expect(result[0]?.score).toBe(0.5);
  });

  it("boosts an above-average pillar and dampens a below-average one", () => {
    const suggestions = [
      makeSuggestion({ pillar: "CASE_STUDY", score: 0.5 }),
      makeSuggestion({ pillar: "EDUCATIONAL", score: 0.5 }),
    ];
    const pillarPerformance = {
      CASE_STUDY: { avgEngagementRate: 0.2, sampleCount: CONFIDENCE_SAMPLE_CAP }, // above weighted avg
      EDUCATIONAL: { avgEngagementRate: 0.02, sampleCount: CONFIDENCE_SAMPLE_CAP }, // below weighted avg
    };

    const result = applyPillarScoreBoost(suggestions, pillarPerformance);

    expect(result[0]?.score).toBeGreaterThan(0.5);
    expect(result[1]?.score).toBeLessThan(0.5);
  });

  it("clamps the final score to [0,1] at both extremes", () => {
    const suggestions = [
      makeSuggestion({ pillar: "CASE_STUDY", score: 0.95 }),
      makeSuggestion({ pillar: "EDUCATIONAL", score: 0.05 }),
    ];
    const pillarPerformance = {
      CASE_STUDY: { avgEngagementRate: 1, sampleCount: CONFIDENCE_SAMPLE_CAP },
      EDUCATIONAL: { avgEngagementRate: 0.0001, sampleCount: CONFIDENCE_SAMPLE_CAP },
    };

    const result = applyPillarScoreBoost(suggestions, pillarPerformance);

    expect(result[0]?.score).toBeLessThanOrEqual(1);
    expect(result[1]?.score).toBeGreaterThanOrEqual(0);
  });

  it("dampens the boost for a low-sample-count pillar relative to a high-sample-count one", () => {
    const lowSample = [makeSuggestion({ pillar: "CASE_STUDY", score: 0.5 })];
    const highSample = [makeSuggestion({ pillar: "CASE_STUDY", score: 0.5 })];

    const lowResult = applyPillarScoreBoost(lowSample, {
      CASE_STUDY: { avgEngagementRate: 0.2, sampleCount: 1 },
      EDUCATIONAL: { avgEngagementRate: 0.02, sampleCount: 1 },
    });
    const highResult = applyPillarScoreBoost(highSample, {
      CASE_STUDY: { avgEngagementRate: 0.2, sampleCount: CONFIDENCE_SAMPLE_CAP },
      EDUCATIONAL: { avgEngagementRate: 0.02, sampleCount: CONFIDENCE_SAMPLE_CAP },
    });

    const lowDelta = (lowResult[0]?.score ?? 0) - 0.5;
    const highDelta = (highResult[0]?.score ?? 0) - 0.5;
    expect(lowDelta).toBeGreaterThan(0);
    expect(highDelta).toBeGreaterThan(0);
    expect(lowDelta).toBeLessThan(highDelta);
  });

  it("bounds the boost magnitude regardless of outlier magnitude", () => {
    // Two scenarios where CASE_STUDY outperforms EDUCATIONAL by very different
    // absolute magnitudes (0.02 vs 0.5) but both hit the relativeDelta=1 cap
    // (EDUCATIONAL at 0 engagement puts CASE_STUDY at exactly 2x the weighted
    // overall average in both cases) — both must saturate to the SAME
    // MAX_SCORE_DELTA, proving the pre-scale clamp does real work, not just
    // the final [0,1] clamp.
    const modest = [makeSuggestion({ pillar: "CASE_STUDY", score: 0.5 })];
    const extreme = [makeSuggestion({ pillar: "CASE_STUDY", score: 0.5 })];

    const modestResult = applyPillarScoreBoost(modest, {
      CASE_STUDY: { avgEngagementRate: 0.02, sampleCount: CONFIDENCE_SAMPLE_CAP },
      EDUCATIONAL: { avgEngagementRate: 0, sampleCount: CONFIDENCE_SAMPLE_CAP },
    });
    const extremeResult = applyPillarScoreBoost(extreme, {
      CASE_STUDY: { avgEngagementRate: 0.5, sampleCount: CONFIDENCE_SAMPLE_CAP },
      EDUCATIONAL: { avgEngagementRate: 0, sampleCount: CONFIDENCE_SAMPLE_CAP },
    });

    const modestDelta = (modestResult[0]?.score ?? 0) - 0.5;
    const extremeDelta = (extremeResult[0]?.score ?? 0) - 0.5;

    expect(modestDelta).toBeCloseTo(MAX_SCORE_DELTA, 5);
    expect(extremeDelta).toBeCloseTo(MAX_SCORE_DELTA, 5);
  });
});
