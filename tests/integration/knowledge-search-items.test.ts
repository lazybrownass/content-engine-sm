import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

import { requireOwner } from "@/lib/auth/require-owner";
import { searchKnowledge } from "@/lib/knowledge/search";
import { searchKnowledgeItems } from "@/features/knowledge/queries";

vi.mock("@/lib/auth/require-owner", () => ({
  requireOwner: vi.fn(),
  AuthError: class AuthError extends Error {},
}));
vi.mock("@/lib/knowledge/search", () => ({ searchKnowledge: vi.fn() }));

const prisma = new PrismaClient();

let ownerIdsThisTest: string[] = [];

async function createOwner(): Promise<string> {
  const ownerId = randomUUID();
  ownerIdsThisTest.push(ownerId);
  await prisma.user.create({ data: { id: ownerId, email: `${ownerId}@example.com` } });
  return ownerId;
}

async function createItem(ownerId: string, title: string): Promise<string> {
  const item = await prisma.knowledgeItem.create({
    data: { ownerId, category: "FAQ", title, body: "body" },
  });
  return item.id;
}

afterEach(async () => {
  vi.clearAllMocks();
  if (ownerIdsThisTest.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: ownerIdsThisTest } } });
    ownerIdsThisTest = [];
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("searchKnowledgeItems", () => {
  it("returns [] when searchKnowledge finds nothing", async () => {
    const ownerId = await createOwner();
    vi.mocked(requireOwner).mockResolvedValue(ownerId);
    vi.mocked(searchKnowledge).mockResolvedValue([]);

    const result = await searchKnowledgeItems("anything");

    expect(result).toEqual([]);
  });

  it("joins chunk results to full items, ordered by score descending", async () => {
    const ownerId = await createOwner();
    const itemAId = await createItem(ownerId, "Item A");
    const itemBId = await createItem(ownerId, "Item B");
    vi.mocked(requireOwner).mockResolvedValue(ownerId);
    vi.mocked(searchKnowledge).mockResolvedValue([
      {
        chunkId: randomUUID(),
        knowledgeItemId: itemAId,
        title: "Item A",
        category: "FAQ",
        content: "chunk from A",
        score: 0.2,
      },
      {
        chunkId: randomUUID(),
        knowledgeItemId: itemBId,
        title: "Item B",
        category: "FAQ",
        content: "chunk from B",
        score: 0.9,
      },
    ]);

    const result = await searchKnowledgeItems("query");

    expect(result.map((r) => r.item.id)).toEqual([itemBId, itemAId]);
    expect(result[0]!.matchedContent).toBe("chunk from B");
    expect(result[0]!.score).toBe(0.9);
  });

  it("collapses multiple chunks from the same item, keeping the higher score", async () => {
    const ownerId = await createOwner();
    const itemId = await createItem(ownerId, "Item with two matching chunks");
    vi.mocked(requireOwner).mockResolvedValue(ownerId);
    vi.mocked(searchKnowledge).mockResolvedValue([
      {
        chunkId: randomUUID(),
        knowledgeItemId: itemId,
        title: "Item with two matching chunks",
        category: "FAQ",
        content: "weaker chunk",
        score: 0.3,
      },
      {
        chunkId: randomUUID(),
        knowledgeItemId: itemId,
        title: "Item with two matching chunks",
        category: "FAQ",
        content: "stronger chunk",
        score: 0.8,
      },
    ]);

    const result = await searchKnowledgeItems("query");

    expect(result).toHaveLength(1);
    expect(result[0]!.matchedContent).toBe("stronger chunk");
    expect(result[0]!.score).toBe(0.8);
  });

  it("drops a result whose item no longer matches this owner", async () => {
    const ownerId = await createOwner();
    const otherOwnerId = await createOwner();
    const otherOwnersItemId = await createItem(otherOwnerId, "Belongs to someone else");
    vi.mocked(requireOwner).mockResolvedValue(ownerId);
    vi.mocked(searchKnowledge).mockResolvedValue([
      {
        chunkId: randomUUID(),
        knowledgeItemId: otherOwnersItemId,
        title: "Belongs to someone else",
        category: "FAQ",
        content: "should not surface",
        score: 0.9,
      },
    ]);

    const result = await searchKnowledgeItems("query");

    expect(result).toEqual([]);
  });
});
