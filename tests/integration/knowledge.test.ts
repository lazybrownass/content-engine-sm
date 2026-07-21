import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient, type KnowledgeItem } from "@prisma/client";

import { requireOwner } from "@/lib/auth/require-owner";
import {
  createKnowledgeItem,
  updateKnowledgeItem,
  archiveKnowledgeItem,
  bulkImportKnowledgeItems,
} from "@/features/knowledge/actions";
import { getKnowledgeItems, getKnowledgeItemById } from "@/features/knowledge/queries";

vi.mock("@/lib/auth/require-owner", () => ({
  requireOwner: vi.fn(),
  AuthError: class AuthError extends Error {},
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const prisma = new PrismaClient();

const ownerA = randomUUID();
const ownerB = randomUUID();
const ownerC = randomUUID();

beforeAll(async () => {
  await prisma.user.createMany({
    data: [
      { id: ownerA, email: `owner-a-${ownerA}@example.com` },
      { id: ownerB, email: `owner-b-${ownerB}@example.com` },
      { id: ownerC, email: `owner-c-${ownerC}@example.com` },
    ],
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [ownerA, ownerB, ownerC] } } });
  await prisma.$disconnect();
});

describe("actions", () => {
  beforeEach(() => {
    vi.mocked(requireOwner).mockResolvedValue(ownerA);
  });

  it("createKnowledgeItem creates an owner-scoped item", async () => {
    const result = await createKnowledgeItem({
      category: "FAQ",
      title: "What is our pricing model?",
      body: "We charge per seat.",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.ownerId).toBe(ownerA);

    const row = await prisma.knowledgeItem.findUnique({ where: { id: result.data.id } });
    expect(row).not.toBeNull();
  });

  it("createKnowledgeItem rejects invalid input", async () => {
    const result = await createKnowledgeItem({
      category: "FAQ",
      body: "Missing a title.",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("updateKnowledgeItem updates an existing item", async () => {
    const created = await createKnowledgeItem({
      category: "FAQ",
      title: "Original title",
      body: "Original body.",
    });
    expect(created.success).toBe(true);
    if (!created.success) return;

    const result = await updateKnowledgeItem({ id: created.data.id, title: "Updated title" });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.title).toBe("Updated title");
  });

  it("archiveKnowledgeItem archives an item owned by the current owner", async () => {
    const created = await createKnowledgeItem({
      category: "FAQ",
      title: "To be archived",
      body: "Body.",
    });
    expect(created.success).toBe(true);
    if (!created.success) return;

    const result = await archiveKnowledgeItem(created.data.id);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.archived).toBe(true);

    const row = await prisma.knowledgeItem.findUnique({ where: { id: created.data.id } });
    expect(row?.archived).toBe(true);
  });

  it("archiveKnowledgeItem does not archive another owner's item", async () => {
    const created = await createKnowledgeItem({
      category: "FAQ",
      title: "Belongs to owner A",
      body: "Body.",
    });
    expect(created.success).toBe(true);
    if (!created.success) return;

    vi.mocked(requireOwner).mockResolvedValue(ownerB);
    const result = await archiveKnowledgeItem(created.data.id);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("NOT_FOUND");

    const row = await prisma.knowledgeItem.findUnique({ where: { id: created.data.id } });
    expect(row?.archived).toBe(false);
  });

  it("bulkImportKnowledgeItems creates valid rows and reports invalid ones", async () => {
    const result = await bulkImportKnowledgeItems([
      { category: "FAQ", title: "Row 1", body: "Body 1" },
      { category: "NOT_A_CATEGORY", title: "Row 2", body: "Body 2" },
      { category: "FAQ", title: "Row 3", body: "Body 3" },
    ]);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.created).toHaveLength(2);
    expect(result.data.rejected).toEqual([{ row: 1, error: expect.any(String) }]);

    const count = await prisma.knowledgeItem.count({
      where: { ownerId: ownerA, title: { in: ["Row 1", "Row 3"] } },
    });
    expect(count).toBe(2);
  });
});

describe("queries", () => {
  let seeded: KnowledgeItem[] = [];

  beforeAll(async () => {
    const item1 = await prisma.knowledgeItem.create({
      data: {
        ownerId: ownerC,
        category: "PROJECT",
        title: "Building the analytics dashboard",
        body: "Notes on the build.",
        pillarHints: ["BUILD_IN_PUBLIC"],
      },
    });
    const item2 = await prisma.knowledgeItem.create({
      data: {
        ownerId: ownerC,
        category: "FAQ",
        title: "Common onboarding questions",
        body: "Answers to FAQs.",
        pillarHints: ["EDUCATIONAL", "TECHNICAL_INSIGHT"],
      },
    });
    const item3 = await prisma.knowledgeItem.create({
      data: {
        ownerId: ownerC,
        category: "CASE_STUDY",
        title: "How we improved uniquesearchterm123 latency",
        body: "A case study.",
        pillarHints: ["CASE_STUDY"],
      },
    });
    seeded = [item1, item2, item3];

    await prisma.knowledgeItem.create({
      data: {
        ownerId: ownerB,
        category: "FAQ",
        title: "Belongs to a different owner",
        body: "Should never show up for ownerC.",
      },
    });
  });

  beforeEach(() => {
    vi.mocked(requireOwner).mockResolvedValue(ownerC);
  });

  it("filters by category", async () => {
    const result = await getKnowledgeItems({ category: "FAQ" });
    expect(result.items.map((i) => i.id)).toEqual([seeded[1].id]);
  });

  it("filters by pillar", async () => {
    const result = await getKnowledgeItems({ pillar: "TECHNICAL_INSIGHT" });
    expect(result.items.map((i) => i.id)).toEqual([seeded[1].id]);
  });

  it("filters by search term, case-insensitively", async () => {
    const result = await getKnowledgeItems({ search: "UNIQUESEARCHTERM123" });
    expect(result.items.map((i) => i.id)).toEqual([seeded[2].id]);
  });

  it("never returns another owner's items", async () => {
    const result = await getKnowledgeItems({});
    expect(result.items.map((i) => i.id).sort()).toEqual(
      seeded.map((i) => i.id).sort(),
    );
  });

  it("paginates with a cursor", async () => {
    const firstPage = await getKnowledgeItems({ limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await getKnowledgeItems({ limit: 2, cursor: firstPage.nextCursor! });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();

    const allIds = [...firstPage.items, ...secondPage.items].map((i) => i.id).sort();
    expect(allIds).toEqual(seeded.map((i) => i.id).sort());
  });

  it("getKnowledgeItemById returns the item for its owner", async () => {
    const result = await getKnowledgeItemById(seeded[0].id);
    expect(result?.id).toBe(seeded[0].id);
  });

  it("getKnowledgeItemById returns null for another owner", async () => {
    vi.mocked(requireOwner).mockResolvedValue(ownerB);
    const result = await getKnowledgeItemById(seeded[0].id);
    expect(result).toBeNull();
  });

  it("getKnowledgeItemById rejects a malformed id", async () => {
    await expect(getKnowledgeItemById("not-a-uuid")).rejects.toThrow();
  });
});
