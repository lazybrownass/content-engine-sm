// The cross-encoder reranker (lib/ai/rerank.ts) passes through the model's raw score, which
// for BAAI/bge-reranker-v2-m3 is a logit, not a calibrated 0-1 probability. Displaying it
// directly as a percentage would overclaim precision the model doesn't provide. Min-max
// normalizing within the current result set instead gives an honest relative ranking — always
// reads sensibly regardless of the underlying model's raw numeric range.
export function computeRelevancePercentages(scores: number[]): number[] {
  if (scores.length === 0) return [];

  const min = Math.min(...scores);
  const max = Math.max(...scores);
  if (max === min) return scores.map(() => 100);

  return scores.map((score) => Math.round(((score - min) / (max - min)) * 100));
}
