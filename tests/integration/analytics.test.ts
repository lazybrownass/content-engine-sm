import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

import { requireOwner } from "@/lib/auth/require-owner";
import { logAnalyticsSnapshot, recomputeStyleMemory } from "@/features/analytics/actions";
import { getStyleMemoryForPrompt } from "@/features/analytics/queries";
import { MIN_SAMPLE_POSTS } from "@/features/analytics/style-memory";

vi.mock("@/lib/auth/require-owner", () => ({
  requireOwner: vi.fn(),
  AuthError: class AuthError extends Error {},
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const prisma = new PrismaClient();

const ownerA = randomUUID(); // logAnalyticsSnapshot tests
const ownerB = randomUUID(); // cross-owner isolation
const ownerC = randomUUID(); // recompute tests, isolated so the threshold is deterministic

const OWNERS = [ownerA, ownerB, ownerC];

const WINNING_TEXT = "Shipping fast matters. Shipping teaches you plenty about scope.";

beforeAll(async () => {
  await prisma.user.createMany({
    data: OWNERS.map((id, i) => ({ id, email: `analytics-${i}-${id}@example.com` })),
  });
});

afterAll(async () => {
  await prisma.styleMemoryProfile.deleteMany({ where: { ownerId: { in: OWNERS } } });
  await prisma.post.deleteMany({ where: { ownerId: { in: OWNERS } } });
  await prisma.user.deleteMany({ where: { id: { in: OWNERS } } });
  await prisma.$disconnect();
});

async function makePost(ownerId: string, overrides: Record<string, unknown> = {}) {
  return prisma.post.create({ data: { ownerId, pillar: "CASE_STUDY", ...overrides } });
}

// Seeds `count` PUBLISHED posts for an owner, each with one analytics snapshot carrying a
// distinct engagement rate so the top performers are deterministic.
async function seedPublishedWithMetrics(ownerId: string, count: number, text = WINNING_TEXT) {
  for (let i = 0; i < count; i++) {
    const post = await makePost(ownerId, { status: "PUBLISHED", finalText: text });
    await prisma.analyticsSnapshot.create({
      data: { postId: post.id, source: "manual", engagementRate: (i + 1) / 100 },
    });
  }
}

describe("logAnalyticsSnapshot", () => {
  beforeEach(() => {
    vi.mocked(requireOwner).mockResolvedValue(ownerA);
  });

  it("writes a snapshot and derives engagement rate from impressions", async () => {
    const post = await makePost(ownerA, { status: "PUBLISHED", finalText: "Body." });

    const result = await logAnalyticsSnapshot({
      postId: post.id,
      impressions: 1000,
      reactions: 20,
      comments: 5,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.impressions).toBe(1000);
    expect(result.data.engagementRate).toBeCloseTo(0.025, 5); // (20 + 5) / 1000
  });

  it("rejects invalid input", async () => {
    const result = await logAnalyticsSnapshot({ postId: "not-a-uuid" });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("does not log analytics for another owner's post", async () => {
    const post = await makePost(ownerA, { status: "PUBLISHED", finalText: "Body." });

    vi.mocked(requireOwner).mockResolvedValue(ownerB);
    const result = await logAnalyticsSnapshot({ postId: post.id, impressions: 10 });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });
});

describe("recomputeStyleMemory", () => {
  beforeEach(() => {
    vi.mocked(requireOwner).mockResolvedValue(ownerC);
  });

  it("stays at baseline below the sample threshold", async () => {
    await seedPublishedWithMetrics(ownerC, MIN_SAMPLE_POSTS - 1);

    const result = await recomputeStyleMemory();

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.avgSentenceLength).toBeNull();

    const examples = await prisma.styleMemoryExample.count({
      where: { styleMemoryProfileId: result.data.id },
    });
    expect(examples).toBe(0);

    // A signal-less profile injects nothing into prompts.
    const forPrompt = await getStyleMemoryForPrompt(ownerC);
    expect(forPrompt).not.toBeNull();
    expect(forPrompt?.avgSentenceLength).toBeNull();
  });

  it("computes a profile and winning examples once enough scored posts exist", async () => {
    // Top up past the threshold (the previous test already seeded some).
    const existing = await prisma.post.count({ where: { ownerId: ownerC, status: "PUBLISHED" } });
    if (existing < MIN_SAMPLE_POSTS) {
      await seedPublishedWithMetrics(ownerC, MIN_SAMPLE_POSTS - existing);
    }

    const result = await recomputeStyleMemory();

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.avgSentenceLength).not.toBeNull();
    expect(result.data.favoriteVocabulary).toContain("shipping");
    expect(result.data.lastComputedAt).not.toBeNull();

    const examples = await prisma.styleMemoryExample.count({
      where: { styleMemoryProfileId: result.data.id },
    });
    expect(examples).toBeGreaterThan(0);

    const forPrompt = await getStyleMemoryForPrompt(ownerC);
    expect(forPrompt?.avgSentenceLength).not.toBeNull();
    expect(forPrompt?.exampleHooks[0]).toContain("Shipping fast matters");
  });
});
