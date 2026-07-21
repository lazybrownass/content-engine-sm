import { callHuggingFaceInference } from "@/lib/ai/providers/huggingface";

export const EMBEDDING_MODEL = "BAAI/bge-base-en-v1.5"; // 768 dims, matches KnowledgeChunk.embedding column
const EMBEDDING_DIMENSIONS = 768;

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "number");
}

// bge-base-en-v1.5 has a built-in pooling layer, so the Inference API is expected to return
// one pooled vector per input. This mean-pools defensively in case a future model swap returns
// raw token-level vectors instead.
export function meanPool(tokenVectors: number[][]): number[] {
  if (tokenVectors.length === 0) {
    throw new Error("meanPool requires at least one token vector");
  }

  const dimensions = tokenVectors[0]!.length;
  const sums = new Array<number>(dimensions).fill(0);
  for (const vector of tokenVectors) {
    for (let i = 0; i < dimensions; i++) {
      sums[i] += vector[i]!;
    }
  }
  return sums.map((sum) => sum / tokenVectors.length);
}

function normalizeEmbeddingResponse(raw: unknown, expectedCount: number): number[][] {
  if (!Array.isArray(raw) || raw.length !== expectedCount) {
    throw new Error(
      `HuggingFace embedding response shape mismatch: expected ${expectedCount} vectors, got ${
        Array.isArray(raw) ? raw.length : typeof raw
      }`,
    );
  }

  return raw.map((entry): number[] => {
    if (isNumberArray(entry)) return entry; // already pooled: one vector per input
    if (Array.isArray(entry) && entry.every(isNumberArray)) {
      return meanPool(entry as number[][]); // token-level: mean-pool per input
    }
    throw new Error("HuggingFace embedding response shape mismatch: unexpected entry shape");
  });
}

function assertValidEmbedding(vector: number[]): void {
  if (vector.length !== EMBEDDING_DIMENSIONS || !vector.every(Number.isFinite)) {
    throw new Error(
      `Embedding has unexpected shape: expected ${EMBEDDING_DIMENSIONS} finite dimensions, got ${vector.length}`,
    );
  }
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const raw = await callHuggingFaceInference<unknown>({
    model: EMBEDDING_MODEL,
    inputs: texts,
    path: "pipeline/feature-extraction",
  });

  const vectors = normalizeEmbeddingResponse(raw, texts.length);
  vectors.forEach(assertValidEmbedding);
  return vectors;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embed([text]);
  return vector!;
}
