import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

import { embed } from "@/lib/ai/embeddings";
import {
  chunkAndQueueKnowledgeItem,
  processPendingKnowledgeChunks,
} from "@/lib/knowledge/embedding-pipeline";

vi.mock("@/lib/ai/embeddings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/embeddings")>();
  return { ...actual, embed: vi.fn() };
});

const prisma = new PrismaClient();
const dim768 = (fill: number) => new Array(768).fill(fill);

let currentOwnerId: string | null = null;

async function createItem(body = "placeholder"): Promise<string> {
  const ownerId = randomUUID();
  currentOwnerId = ownerId;
  await prisma.user.create({ data: { id: ownerId, email: `${ownerId}@example.com` } });
  const item = await prisma.knowledgeItem.create({
    data: { ownerId, category: "FAQ", title: "Test item", body },
  });
  return item.id;
}

afterEach(async () => {
  vi.clearAllMocks();
  if (currentOwnerId) {
    await prisma.user.deleteMany({ where: { id: currentOwnerId } }); // cascades item -> chunks
    currentOwnerId = null;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("chunkAndQueueKnowledgeItem", () => {
  it("creates pending chunks with correct content", async () => {
    const id = await createItem();
    await chunkAndQueueKnowledgeItem(id, "First paragraph.\n\nSecond paragraph.");

    const chunks = await prisma.knowledgeChunk.findMany({
      where: { knowledgeItemId: id },
      orderBy: { ordinal: "asc" },
    });

    expect(chunks.map((c) => c.content)).toEqual(["First paragraph.\n\nSecond paragraph."]);
    expect(chunks.every((c) => c.embeddingStatus === "pending")).toBe(true);
  });

  it("replaces existing chunks on re-chunk", async () => {
    const id = await createItem();
    await chunkAndQueueKnowledgeItem(id, "Original body.");
    const firstPass = await prisma.knowledgeChunk.findMany({ where: { knowledgeItemId: id } });
    expect(firstPass).toHaveLength(1);

    await chunkAndQueueKnowledgeItem(id, "Completely different body now.");
    const secondPass = await prisma.knowledgeChunk.findMany({ where: { knowledgeItemId: id } });

    expect(secondPass).toHaveLength(1);
    expect(secondPass[0]!.content).toBe("Completely different body now.");
    expect(secondPass[0]!.id).not.toBe(firstPass[0]!.id);
  });

  it("leaves no chunks for an empty body", async () => {
    const id = await createItem();
    await chunkAndQueueKnowledgeItem(id, "   ");

    const chunks = await prisma.knowledgeChunk.findMany({ where: { knowledgeItemId: id } });
    expect(chunks).toEqual([]);
  });
});

describe("processPendingKnowledgeChunks", () => {
  it("embeds pending chunks and marks them ready", async () => {
    const id = await createItem();
    vi.mocked(embed).mockResolvedValue([dim768(0.1)]);
    await chunkAndQueueKnowledgeItem(id, "A single chunk of content.");

    const result = await processPendingKnowledgeChunks();

    expect(result).toEqual({ processed: 1, failed: 0 });

    const [row] = await prisma.$queryRaw<
      { embeddingStatus: string; embeddingModel: string | null; dims: number | null }[]
    >`SELECT "embeddingStatus", "embeddingModel", vector_dims(embedding) as dims
      FROM knowledge_chunks WHERE "knowledgeItemId" = ${id}::uuid`;

    expect(row?.embeddingStatus).toBe("ready");
    expect(row?.embeddingModel).toBe("BAAI/bge-base-en-v1.5");
    expect(row?.dims).toBe(768);
  });

  it("marks a batch failed if embed() rejects, without throwing", async () => {
    const id = await createItem();
    vi.mocked(embed).mockRejectedValue(new Error("HF is down"));
    await chunkAndQueueKnowledgeItem(id, "Will fail to embed.");

    const result = await processPendingKnowledgeChunks();

    expect(result).toEqual({ processed: 0, failed: 1 });

    const chunk = await prisma.knowledgeChunk.findFirst({ where: { knowledgeItemId: id } });
    expect(chunk?.embeddingStatus).toBe("failed");
  });

  it("respects maxChunks, leaving the remainder pending", async () => {
    const id = await createItem();
    vi.mocked(embed).mockImplementation(async (texts) => texts.map(() => dim768(0.2)));
    await prisma.knowledgeChunk.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        knowledgeItemId: id,
        ordinal: i,
        content: `chunk ${i}`,
      })),
    });

    const result = await processPendingKnowledgeChunks({ maxChunks: 3 });

    expect(result).toEqual({ processed: 3, failed: 0 });

    const remainingPending = await prisma.knowledgeChunk.count({
      where: { knowledgeItemId: id, embeddingStatus: "pending" },
    });
    expect(remainingPending).toBe(2);
  });
});
