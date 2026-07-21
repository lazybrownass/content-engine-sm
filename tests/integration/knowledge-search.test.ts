import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

import { embedQuery } from "@/lib/ai/embeddings";
import { rerank } from "@/lib/ai/rerank";
import { searchKnowledge } from "@/lib/knowledge/search";

vi.mock("@/lib/ai/embeddings", () => ({ embedQuery: vi.fn() }));
vi.mock("@/lib/ai/rerank", () => ({ rerank: vi.fn() }));

const prisma = new PrismaClient();

const dim768 = (fill: number) => new Array(768).fill(fill);
const toVectorLiteral = (vector: number[]) => `[${vector.join(",")}]`;

// Default: rerank preserves candidate order with a descending placeholder score. Individual
// tests that care about final ordering override this mock explicitly.
function mockRerankPassthrough() {
  vi.mocked(rerank).mockImplementation((_query, candidates) =>
    Promise.resolve(candidates.map((c, i) => ({ id: c.id, score: candidates.length - i }))),
  );
}

const createdOwnerIds: string[] = [];

async function createOwner(): Promise<string> {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@example.com` } });
  createdOwnerIds.push(id);
  return id;
}

async function createItemWithChunk(params: {
  ownerId: string;
  title: string;
  body: string;
  chunkContent: string;
  archived?: boolean;
  embedding?: number[]; // omit to leave embeddingStatus = 'pending'
}) {
  const item = await prisma.knowledgeItem.create({
    data: {
      ownerId: params.ownerId,
      category: "FAQ",
      title: params.title,
      body: params.body,
      archived: params.archived ?? false,
    },
  });

  const chunk = await prisma.knowledgeChunk.create({
    data: { knowledgeItemId: item.id, ordinal: 0, content: params.chunkContent },
  });

  if (params.embedding) {
    const literal = toVectorLiteral(params.embedding);
    await prisma.$executeRaw`
      UPDATE knowledge_chunks
      SET embedding = ${literal}::vector,
          "embeddingModel" = 'test',
          "embeddingStatus" = 'ready'
      WHERE id = ${chunk.id}::uuid
    `;
  }

  return { item, chunk };
}

afterEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdOwnerIds } } });
  await prisma.$disconnect();
});

describe("searchKnowledge", () => {
  it("throws on an empty query without touching the DB or HF", async () => {
    await expect(searchKnowledge({ ownerId: randomUUID(), query: "   " })).rejects.toThrow();
    expect(embedQuery).not.toHaveBeenCalled();
    expect(rerank).not.toHaveBeenCalled();
  });

  it("finds a chunk via keyword full-text search alone", async () => {
    const ownerId = await createOwner();
    mockRerankPassthrough();
    vi.mocked(embedQuery).mockResolvedValue(dim768(0)); // no ready chunks exist for this fresh owner

    await createItemWithChunk({
      ownerId,
      title: "Migrating our onboarding flow to uniquekeywordalpha",
      body: "Details of the migration.",
      chunkContent: "We rebuilt onboarding around uniquekeywordalpha.",
    });

    const results = await searchKnowledge({ ownerId, query: "uniquekeywordalpha" });

    expect(results).toHaveLength(1);
    expect(results[0]!.content).toBe("We rebuilt onboarding around uniquekeywordalpha.");
  });

  it("finds a chunk via vector similarity with no keyword overlap", async () => {
    const ownerId = await createOwner();
    const targetEmbedding = dim768(0.42);
    mockRerankPassthrough();
    vi.mocked(embedQuery).mockResolvedValue(targetEmbedding);

    await createItemWithChunk({
      ownerId,
      title: "Completely unrelated title zzqqvv",
      body: "No shared words with the query at all.",
      chunkContent: "Totally different phrasing, semantically close via embedding only.",
      embedding: targetEmbedding,
    });

    const results = await searchKnowledge({ ownerId, query: "something else entirely" });

    expect(results).toHaveLength(1);
    expect(results[0]!.content).toBe(
      "Totally different phrasing, semantically close via embedding only.",
    );
  });

  it("never returns another owner's chunks", async () => {
    const otherOwnerId = await createOwner();
    const searchingOwnerId = await createOwner();
    mockRerankPassthrough();
    vi.mocked(embedQuery).mockResolvedValue(dim768(0));

    await createItemWithChunk({
      ownerId: otherOwnerId,
      title: "Owner-scoped secret uniquekeywordisolation",
      body: "Should never appear for another owner.",
      chunkContent: "Private content uniquekeywordisolation.",
    });

    const results = await searchKnowledge({
      ownerId: searchingOwnerId,
      query: "uniquekeywordisolation",
    });

    expect(results).toEqual([]);
  });

  it("excludes archived items from both FTS and vector candidates", async () => {
    const ownerId = await createOwner();
    const embedding = dim768(0.77);
    mockRerankPassthrough();
    vi.mocked(embedQuery).mockResolvedValue(embedding);

    await createItemWithChunk({
      ownerId,
      title: "Archived item uniquekeywordarchived",
      body: "Should not be found.",
      chunkContent: "Archived content uniquekeywordarchived.",
      embedding,
      archived: true,
    });

    const results = await searchKnowledge({ ownerId, query: "uniquekeywordarchived" });

    expect(results).toEqual([]);
  });

  it("excludes non-ready embeddingStatus chunks from vector candidates but keeps them FTS-reachable", async () => {
    const ownerId = await createOwner();
    mockRerankPassthrough();
    vi.mocked(embedQuery).mockResolvedValue(dim768(0));

    await createItemWithChunk({
      ownerId,
      title: "Pending embedding uniquekeywordpending",
      body: "Reachable via keyword, not yet embedded.",
      chunkContent: "Pending content uniquekeywordpending.",
      // no embedding passed -> embeddingStatus stays 'pending'
    });

    const results = await searchKnowledge({ ownerId, query: "uniquekeywordpending" });

    expect(results).toHaveLength(1);
    expect(results[0]!.content).toBe("Pending content uniquekeywordpending.");
  });

  it("respects limit and orders results by the reranker's scores", async () => {
    const ownerId = await createOwner();
    vi.mocked(embedQuery).mockResolvedValue(dim768(0));
    vi.mocked(rerank).mockImplementation((_query, candidates) =>
      Promise.resolve(
        candidates
          .map((c) => ({
            id: c.id,
            score: c.text.includes("high") ? 1 : c.text.includes("mid") ? 0.5 : 0.1,
          }))
          .sort((a, b) => b.score - a.score),
      ),
    );

    const base = { ownerId, title: "Ranking test uniquekeywordranking", body: "body" };
    await createItemWithChunk({ ...base, chunkContent: "low relevance uniquekeywordranking" });
    await createItemWithChunk({ ...base, chunkContent: "high relevance uniquekeywordranking" });
    await createItemWithChunk({ ...base, chunkContent: "mid relevance uniquekeywordranking" });

    const results = await searchKnowledge({ ownerId, query: "uniquekeywordranking", limit: 2 });

    expect(results).toHaveLength(2);
    expect(results[0]!.content).toBe("high relevance uniquekeywordranking");
    expect(results[1]!.content).toBe("mid relevance uniquekeywordranking");
  });
});
