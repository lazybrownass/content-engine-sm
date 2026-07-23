// Pure, DB-free topic-score boosting. Nudges LLM-suggested topic scores toward
// pillars that have historically demonstrated higher engagement, so the learning
// loop influences suggestions themselves rather than just generated text.
// Kept separate from style-memory.ts — a different concern (pillar-level
// engagement scoring, not per-post style aggregation).

import type { TopicSuggestion } from "@/features/pipeline/schema";
import type { PillarPerformance } from "./queries";

export const MAX_SCORE_DELTA = 0.15; // absolute score points, either direction
export const CONFIDENCE_SAMPLE_CAP = 5; // sample count at which a pillar's boost saturates to full strength

// Boosts/dampens each suggestion's score based on how its pillar has historically
// performed relative to the owner's overall average engagement. A no-op when
// pillarPerformance carries no signal (below the sample threshold upstream) or
// for any suggestion whose pillar has no historical data of its own.
export function applyPillarScoreBoost(
  suggestions: TopicSuggestion[],
  pillarPerformance: Partial<Record<string, PillarPerformance>>,
): TopicSuggestion[] {
  const entries = Object.values(pillarPerformance).filter((v): v is PillarPerformance => v != null);
  if (entries.length === 0) return suggestions;

  const totalSamples = entries.reduce((sum, p) => sum + p.sampleCount, 0);
  const overallAvg = entries.reduce((sum, p) => sum + p.avgEngagementRate * p.sampleCount, 0) / totalSamples;
  if (overallAvg <= 0) return suggestions;

  return suggestions.map((suggestion) => {
    const perf = pillarPerformance[suggestion.pillar];
    if (!perf) return suggestion;

    const relativeDelta = (perf.avgEngagementRate - overallAvg) / overallAvg;
    const boundedRelativeDelta = Math.max(-1, Math.min(1, relativeDelta));
    const confidence = Math.min(perf.sampleCount / CONFIDENCE_SAMPLE_CAP, 1);
    const delta = boundedRelativeDelta * confidence * MAX_SCORE_DELTA;

    return { ...suggestion, score: Math.max(0, Math.min(1, suggestion.score + delta)) };
  });
}
