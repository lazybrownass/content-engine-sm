import { callHuggingFaceInference } from "@/lib/ai/providers/huggingface";

// Deviates from the TRD's originally-documented cross-encoder/ms-marco-MiniLM-L-6-v2: that model
// isn't deployed on any HF Inference Provider as of this writing (verified against HF's own
// docs). bge-reranker-v2-m3 is the model HF's own text-classification task docs use as their
// live example, and is the same cross-encoder-for-reranking family. See docs/02-TRD.md §5.2.
const RERANK_MODEL = "BAAI/bge-reranker-v2-m3";

export interface RerankCandidate {
  id: string;
  text: string;
}

export interface RerankedResult {
  id: string;
  score: number;
}

function extractScores(raw: unknown, expectedCount: number): number[] {
  const scores = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { output?: unknown }).output)
      ? (raw as { output: unknown[] }).output
      : null;

  if (!scores || scores.length !== expectedCount || !scores.every((s) => typeof s === "number")) {
    throw new Error(`HuggingFace rerank response shape mismatch: expected ${expectedCount} scores`);
  }

  return scores as number[];
}

export async function rerank(
  query: string,
  candidates: RerankCandidate[],
): Promise<RerankedResult[]> {
  if (candidates.length === 0) return [];

  const raw = await callHuggingFaceInference<unknown>({
    model: RERANK_MODEL,
    inputs: candidates.map((candidate) => [query, candidate.text]),
  });

  const scores = extractScores(raw, candidates.length);

  return candidates
    .map((candidate, index) => ({ id: candidate.id, score: scores[index]! }))
    .sort((a, b) => b.score - a.score);
}
