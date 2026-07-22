import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient, type Topic } from "@prisma/client";

import { requireOwner } from "@/lib/auth/require-owner";
import { rejectTopic, updateTopic } from "@/features/topics/actions";
import { getRecentTopicTitles, getTopicById, getTopics } from "@/features/topics/queries";

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
      { id: ownerA, email: `topics-a-${ownerA}@example.com` },
      { id: ownerB, email: `topics-b-${ownerB}@example.com` },
      { id: ownerC, email: `topics-c-${ownerC}@example.com` },
    ],
  });
});

afterAll(async () => {
  await prisma.topic.deleteMany({ where: { ownerId: { in: [ownerA, ownerB, ownerC] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerA, ownerB, ownerC] } } });
  await prisma.$disconnect();
});

async function makeTopic(ownerId: string, overrides: Partial<Topic> = {}) {
  return prisma.topic.create({
    data: {
      ownerId,
      title: "Why we ship in public",
      rationale: "Fills a knowledge gap.",
      pillar: "FOUNDER_STORY",
      ...overrides,
    },
  });
}

describe("actions", () => {
  beforeEach(() => {
    vi.mocked(requireOwner).mockResolvedValue(ownerA);
  });

  it("updateTopic updates a SUGGESTED topic owned by the current owner", async () => {
    const topic = await makeTopic(ownerA);

    const result = await updateTopic({ id: topic.id, title: "Updated title" });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.title).toBe("Updated title");
  });

  it("updateTopic rejects invalid input", async () => {
    const result = await updateTopic({ id: "not-a-uuid" });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("updateTopic does not update another owner's topic", async () => {
    const topic = await makeTopic(ownerA);

    vi.mocked(requireOwner).mockResolvedValue(ownerB);
    const result = await updateTopic({ id: topic.id, title: "Hijacked" });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("NOT_FOUND");

    const row = await prisma.topic.findUnique({ where: { id: topic.id } });
    expect(row?.title).toBe("Why we ship in public");
  });

  it("updateTopic refuses to update a topic that is no longer SUGGESTED", async () => {
    const topic = await makeTopic(ownerA, { status: "ACCEPTED" });

    const result = await updateTopic({ id: topic.id, title: "Too late" });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });

  it("rejectTopic marks a SUGGESTED topic as REJECTED", async () => {
    const topic = await makeTopic(ownerA);

    const result = await rejectTopic(topic.id);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.status).toBe("REJECTED");
  });

  it("rejectTopic does not reject another owner's topic", async () => {
    const topic = await makeTopic(ownerA);

    vi.mocked(requireOwner).mockResolvedValue(ownerB);
    const result = await rejectTopic(topic.id);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("NOT_FOUND");

    const row = await prisma.topic.findUnique({ where: { id: topic.id } });
    expect(row?.status).toBe("SUGGESTED");
  });
});

describe("queries", () => {
  let seeded: Topic[] = [];

  beforeAll(async () => {
    const t1 = await makeTopic(ownerC, { title: "Topic 1", status: "SUGGESTED", pillar: "CASE_STUDY" });
    const t2 = await makeTopic(ownerC, { title: "Topic 2", status: "ACCEPTED", pillar: "EDUCATIONAL" });
    const t3 = await makeTopic(ownerC, { title: "Topic 3", status: "REJECTED", pillar: "CASE_STUDY" });
    seeded = [t1, t2, t3];

    await makeTopic(ownerB, { title: "Belongs to a different owner" });
  });

  beforeEach(() => {
    vi.mocked(requireOwner).mockResolvedValue(ownerC);
  });

  it("filters by status", async () => {
    const result = await getTopics({ status: "ACCEPTED" });
    expect(result.items.map((t) => t.id)).toEqual([seeded[1].id]);
  });

  it("filters by pillar", async () => {
    const result = await getTopics({ pillar: "CASE_STUDY" });
    expect(result.items.map((t) => t.id).sort()).toEqual([seeded[0].id, seeded[2].id].sort());
  });

  it("never returns another owner's topics", async () => {
    const result = await getTopics({});
    expect(result.items.map((t) => t.id).sort()).toEqual(seeded.map((t) => t.id).sort());
  });

  it("getTopicById returns the topic for its owner", async () => {
    const result = await getTopicById(seeded[0].id);
    expect(result?.id).toBe(seeded[0].id);
  });

  it("getTopicById returns null for another owner", async () => {
    vi.mocked(requireOwner).mockResolvedValue(ownerB);
    const result = await getTopicById(seeded[0].id);
    expect(result).toBeNull();
  });

  it("getRecentTopicTitles returns only this owner's titles, most recent first", async () => {
    const titles = await getRecentTopicTitles();
    expect(titles).toEqual(["Topic 3", "Topic 2", "Topic 1"]);
  });
});
