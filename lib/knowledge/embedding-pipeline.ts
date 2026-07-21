import { EMBEDDING_MODEL, embed } from "@/lib/ai/embeddings";
import { prisma } from "@/lib/db/prisma";
import { chunkText } from "@/lib/knowledge/chunking";

const EMBED_BATCH_SIZE = 10;
const DEFAULT_MAX_CHUNKS = 30;
const DEFAULT_TIME_BUDGET_MS = 8_000;

export async function chunkAndQueueKnowledgeItem(
  knowledgeItemId: string,
  body: string,
): Promise<void> {
  await prisma.knowledgeChunk.deleteMany({ where: { knowledgeItemId } });

  const chunks = chunkText(body);
  if (chunks.length === 0) return;

  await prisma.knowledgeChunk.createMany({
    data: chunks.map((content, ordinal) => ({ knowledgeItemId, ordinal, content })),
  });
}

export interface ProcessPendingResult {
  processed: number;
  failed: number;
}

// Global queue processor: picks up any pending chunk across the whole table (oldest first),
// not just chunks from one item. Used both as an after()-scheduled fast path (small budget,
// runs right after a create/update) and as a cron safety net (larger budget, mops up anything
// the fast path didn't finish — see app/api/cron/process-embeddings/route.ts).
export async function processPendingKnowledgeChunks(
  options: { maxChunks?: number; timeBudgetMs?: number } = {},
): Promise<ProcessPendingResult> {
  const maxChunks = options.maxChunks ?? DEFAULT_MAX_CHUNKS;
  const timeBudgetMs = options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;
  const startedAt = Date.now();

  let processed = 0;
  let failed = 0;

  while (processed + failed < maxChunks) {
    if (Date.now() - startedAt > timeBudgetMs) break;

    const batch = await prisma.knowledgeChunk.findMany({
      where: { embeddingStatus: "pending" },
      orderBy: { createdAt: "asc" },
      take: Math.min(EMBED_BATCH_SIZE, maxChunks - processed - failed),
      select: { id: true, content: true },
    });
    if (batch.length === 0) break;

    try {
      const vectors = await embed(batch.map((chunk) => chunk.content));
      await Promise.all(
        batch.map((chunk, index) => {
          // Bound as a text parameter and cast server-side via ::vector — same safe pattern
          // as lib/knowledge/search.ts (no native pgvector bind type in Prisma).
          const literal = `[${vectors[index]!.join(",")}]`;
          return prisma.$executeRaw`
            UPDATE knowledge_chunks
            SET embedding = ${literal}::vector,
                "embeddingModel" = ${EMBEDDING_MODEL},
                "embeddingStatus" = 'ready'
            WHERE id = ${chunk.id}::uuid
          `;
        }),
      );
      processed += batch.length;
    } catch (error) {
      console.error("knowledge embedding batch failed", error);
      await prisma.knowledgeChunk.updateMany({
        where: { id: { in: batch.map((chunk) => chunk.id) } },
        data: { embeddingStatus: "failed" },
      });
      failed += batch.length;
    }
  }

  return { processed, failed };
}
