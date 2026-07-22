import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient, type Post } from "@prisma/client";

import { requireOwner } from "@/lib/auth/require-owner";
import { approvePost, archivePost, updatePost } from "@/features/posts/actions";
import { getPostById, getPosts } from "@/features/posts/queries";

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
      { id: ownerA, email: `posts-a-${ownerA}@example.com` },
      { id: ownerB, email: `posts-b-${ownerB}@example.com` },
      { id: ownerC, email: `posts-c-${ownerC}@example.com` },
    ],
  });
});

afterAll(async () => {
  await prisma.post.deleteMany({ where: { ownerId: { in: [ownerA, ownerB, ownerC] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerA, ownerB, ownerC] } } });
  await prisma.$disconnect();
});

async function makePost(ownerId: string, overrides: Partial<Post> = {}) {
  return prisma.post.create({
    data: { ownerId, pillar: "CASE_STUDY", ...overrides },
  });
}

describe("actions", () => {
  beforeEach(() => {
    vi.mocked(requireOwner).mockResolvedValue(ownerA);
  });

  it("updatePost saves finalText and flips NEEDS_OWNER_REVIEW to IN_EDIT on first save", async () => {
    const post = await makePost(ownerA, { status: "NEEDS_OWNER_REVIEW", finalText: "Draft." });

    const result = await updatePost({ id: post.id, finalText: "Edited draft with more words." });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.finalText).toBe("Edited draft with more words.");
    expect(result.data.status).toBe("IN_EDIT");
    expect(result.data.wordCount).toBe(5);
  });

  it("updatePost does not flip status on a second save", async () => {
    const post = await makePost(ownerA, { status: "IN_EDIT", finalText: "Draft." });

    const result = await updatePost({ id: post.id, finalText: "Edited again." });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.status).toBe("IN_EDIT");
  });

  it("updatePost rejects invalid input", async () => {
    const result = await updatePost({ id: "not-a-uuid", finalText: "x" });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("updatePost does not update another owner's post", async () => {
    const post = await makePost(ownerA, { status: "NEEDS_OWNER_REVIEW" });

    vi.mocked(requireOwner).mockResolvedValue(ownerB);
    const result = await updatePost({ id: post.id, finalText: "Hijacked" });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });

  it("approvePost approves a post in NEEDS_OWNER_REVIEW", async () => {
    const post = await makePost(ownerA, { status: "NEEDS_OWNER_REVIEW" });

    const result = await approvePost(post.id);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.status).toBe("APPROVED");
  });

  it("approvePost approves a post in IN_EDIT", async () => {
    const post = await makePost(ownerA, { status: "IN_EDIT" });

    const result = await approvePost(post.id);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.status).toBe("APPROVED");
  });

  it("approvePost refuses to approve a post in DRAFT", async () => {
    const post = await makePost(ownerA, { status: "DRAFT" });

    const result = await approvePost(post.id);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("INVALID_STATE");
  });

  it("approvePost does not approve another owner's post", async () => {
    const post = await makePost(ownerA, { status: "NEEDS_OWNER_REVIEW" });

    vi.mocked(requireOwner).mockResolvedValue(ownerB);
    const result = await approvePost(post.id);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });

  it("archivePost archives a post unconditionally", async () => {
    const post = await makePost(ownerA, { status: "APPROVED" });

    const result = await archivePost(post.id);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.status).toBe("ARCHIVED");
  });

  it("archivePost does not archive another owner's post", async () => {
    const post = await makePost(ownerA);

    vi.mocked(requireOwner).mockResolvedValue(ownerB);
    const result = await archivePost(post.id);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });
});

describe("queries", () => {
  let seeded: Post[] = [];

  beforeAll(async () => {
    const topic = await prisma.topic.create({
      data: { ownerId: ownerC, title: "Topic for post", rationale: "r", pillar: "CASE_STUDY" },
    });
    const p1 = await makePost(ownerC, { status: "DRAFT", pillar: "CASE_STUDY" });
    const p2 = await makePost(ownerC, { status: "APPROVED", pillar: "EDUCATIONAL", topicId: topic.id });
    const p3 = await makePost(ownerC, { status: "ARCHIVED", pillar: "CASE_STUDY" });
    seeded = [p1, p2, p3];

    await makePost(ownerB, { status: "DRAFT" });
  });

  beforeEach(() => {
    vi.mocked(requireOwner).mockResolvedValue(ownerC);
  });

  it("filters by status", async () => {
    const result = await getPosts({ status: "APPROVED" });
    expect(result.items.map((p) => p.id)).toEqual([seeded[1].id]);
    expect(result.items[0]?.topic?.title).toBe("Topic for post");
  });

  it("filters by pillar", async () => {
    const result = await getPosts({ pillar: "CASE_STUDY" });
    expect(result.items.map((p) => p.id).sort()).toEqual([seeded[0].id, seeded[2].id].sort());
  });

  it("never returns another owner's posts", async () => {
    const result = await getPosts({});
    expect(result.items.map((p) => p.id).sort()).toEqual(seeded.map((p) => p.id).sort());
  });

  it("getPostById returns the post with its topic for its owner", async () => {
    const result = await getPostById(seeded[1].id);
    expect(result?.id).toBe(seeded[1].id);
    expect(result?.topic?.title).toBe("Topic for post");
  });

  it("getPostById returns null for another owner", async () => {
    vi.mocked(requireOwner).mockResolvedValue(ownerB);
    const result = await getPostById(seeded[0].id);
    expect(result).toBeNull();
  });
});
