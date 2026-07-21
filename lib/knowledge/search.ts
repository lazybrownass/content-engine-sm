import type { KnowledgeCategory } from "@prisma/client";

import { embedQuery } from "@/lib/ai/embeddings";
import { rerank } from "@/lib/ai/rerank";
import { prisma } from "@/lib/db/prisma";

const FTS_CANDIDATE_LIMIT = 10;
const VECTOR_CANDIDATE_LIMIT = 10;
const CANDIDATE_POOL_CAP = FTS_CANDIDATE_LIMIT + VECTOR_CANDIDATE_LIMIT;
const DEFAULT_RESULT_LIMIT = 5;
const EMBEDDING_DIMENSIONS = 768;

export interface KnowledgeSearchInput {
  ownerId: string;
  query: string;
  limit?: number;
}

export interface KnowledgeSearchResult {
  chunkId: string;
  knowledgeItemId: string;
  title: string;
  category: KnowledgeCategory;
  content: string;
  score: number;
}

interface CandidateRow {
  chunkId: string;
  knowledgeItemId: string;
  title: string;
  category: KnowledgeCategory;
  content: string;
}

export function dedupeCandidates<T extends { chunkId: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const row of rows) {
    if (seen.has(row.chunkId)) continue;
    seen.add(row.chunkId);
    result.push(row);
  }
  return result;
}

// Note: this is a lib/ utility, not a Server Action, so it takes ownerId explicitly rather than
// calling requireOwner() — the Phase 2 pipeline's Knowledge Retrieval stage will call this from a
// background/cron context with no request-scoped Supabase session to read cookies from. The
// ownerId filter below is the actual security boundary: Prisma's DATABASE_URL connection doesn't
// carry a per-request auth.uid() JWT, so RLS isn't enforced through it (same defense-in-depth
// pattern as features/knowledge/queries.ts).
export async function searchKnowledge(
  input: KnowledgeSearchInput,
): Promise<KnowledgeSearchResult[]> {
  const query = input.query.trim();
  if (!query) {
    throw new Error("query must not be empty");
  }
  const limit =
    input.limit && input.limit > 0
      ? Math.min(input.limit, CANDIDATE_POOL_CAP)
      : DEFAULT_RESULT_LIMIT;

  const [ftsRows, embedding] = await Promise.all([
    prisma.$queryRaw<CandidateRow[]>`
      SELECT
        kc.id AS "chunkId",
        kc."knowledgeItemId" AS "knowledgeItemId",
        ki.title,
        ki.category,
        kc.content
      FROM knowledge_chunks kc
      JOIN knowledge_items ki ON ki.id = kc."knowledgeItemId"
      WHERE ki."ownerId" = ${input.ownerId}::uuid
        AND ki.archived = false
        AND ki.search_vector @@ websearch_to_tsquery('english', ${query})
      ORDER BY ts_rank_cd(ki.search_vector, websearch_to_tsquery('english', ${query})) DESC, kc.ordinal ASC
      LIMIT ${FTS_CANDIDATE_LIMIT}
    `,
    embedQuery(query),
  ]);

  if (embedding.length !== EMBEDDING_DIMENSIONS || !embedding.every(Number.isFinite)) {
    throw new Error("query embedding has unexpected shape");
  }
  // Bound as a text parameter and cast server-side via ::vector — NOT raw string concatenation
  // into SQL syntax. Prisma has no native pgvector bind type, so this is the standard safe
  // pattern for pgvector + Prisma; every element was already validated finite above.
  const vectorLiteral = `[${embedding.join(",")}]`;

  const vectorRows = await prisma.$queryRaw<CandidateRow[]>`
    SELECT
      kc.id AS "chunkId",
      kc."knowledgeItemId" AS "knowledgeItemId",
      ki.title,
      ki.category,
      kc.content
    FROM knowledge_chunks kc
    JOIN knowledge_items ki ON ki.id = kc."knowledgeItemId"
    WHERE ki."ownerId" = ${input.ownerId}::uuid
      AND ki.archived = false
      AND kc."embeddingStatus" = 'ready'
    ORDER BY kc.embedding <=> ${vectorLiteral}::vector
    LIMIT ${VECTOR_CANDIDATE_LIMIT}
  `;

  const candidates = dedupeCandidates([...ftsRows, ...vectorRows]).slice(0, CANDIDATE_POOL_CAP);
  if (candidates.length === 0) return [];

  const ranked = await rerank(
    query,
    candidates.map((candidate) => ({ id: candidate.chunkId, text: candidate.content })),
  );
  const byId = new Map(candidates.map((candidate) => [candidate.chunkId, candidate]));

  return ranked.slice(0, limit).map((result) => ({
    ...byId.get(result.id)!,
    score: result.score,
  }));
}
