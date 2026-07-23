import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

import { requireOwner } from "@/lib/auth/require-owner";
import { logAnalyticsSnapshot, recomputeStyleMemory } from "@/features/analytics/actions";
import {
  getAnalyticsOverview,
  getPillarPerformance,
  getRecentAnalyticsSnapshots,
  getStyleMemoryForPrompt,
} from "@/features/analytics/queries";
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
const ownerD = randomUUID(); // getPillarPerformance tests, isolated so the threshold is deterministic
const ownerE = randomUUID(); // getAnalyticsOverview / getRecentAnalyticsSnapshots tests

const OWNERS = [ownerA, ownerB, ownerC, ownerD, ownerE];

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

// Seeds a single PUBLISHED post with a specific pillar and a single analytics
// snapshot at a specific engagement rate — for tests that need precise control
// over per-pillar aggregates rather than an auto-incrementing series.
async function seedScoredPost(ownerId: string, pillar: string, engagementRate: number) {
  const post = await makePost(ownerId, { status: "PUBLISHED", finalText: WINNING_TEXT, pillar });
  await prisma.analyticsSnapshot.create({
    data: { postId: post.id, source: "manual", engagementRate },
  });
  return post;
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

describe("getPillarPerformance", () => {
  it("returns no signal below the sample threshold", async () => {
    for (let i = 0; i < MIN_SAMPLE_POSTS - 1; i++) {
      await seedScoredPost(ownerD, "CASE_STUDY", 0.1);
    }

    const performance = await getPillarPerformance(ownerD);
    expect(performance).toEqual({});
  });

  it("computes per-pillar averages once the threshold is met, and never leaks another owner's posts", async () => {
    // Top up ownerD's CASE_STUDY posts and add a second pillar so the total
    // crosses MIN_SAMPLE_POSTS across two distinct pillars.
    await seedScoredPost(ownerD, "CASE_STUDY", 0.1); // now MIN_SAMPLE_POSTS CASE_STUDY posts @ 0.1
    await seedScoredPost(ownerD, "EDUCATIONAL", 0.5);
    await seedScoredPost(ownerD, "EDUCATIONAL", 0.3);

    // A different owner's high-engagement posts must never affect ownerD's result.
    for (let i = 0; i < MIN_SAMPLE_POSTS; i++) {
      await seedScoredPost(ownerB, "CASE_STUDY", 0.99);
    }

    const performance = await getPillarPerformance(ownerD);

    expect(performance.CASE_STUDY?.sampleCount).toBe(MIN_SAMPLE_POSTS);
    expect(performance.CASE_STUDY?.avgEngagementRate).toBeCloseTo(0.1, 5);
    expect(performance.EDUCATIONAL?.sampleCount).toBe(2);
    expect(performance.EDUCATIONAL?.avgEngagementRate).toBeCloseTo(0.4, 5);
  });
});

describe("getAnalyticsOverview / getRecentAnalyticsSnapshots", () => {
  beforeEach(() => {
    vi.mocked(requireOwner).mockResolvedValue(ownerE);
  });

  it("returns zeroed overview and an empty snapshot list with no data", async () => {
    const overview = await getAnalyticsOverview();
    expect(overview.totalSnapshots).toBe(0);
    expect(overview.avgEngagementRate).toBeNull();
    expect(overview.topPillar).toBeNull();
    expect(overview.sampleGate.met).toBe(false);

    const snapshots = await getRecentAnalyticsSnapshots(20);
    expect(snapshots).toEqual([]);
  });

  it("aggregates totals/avg/top-pillar and lists recent snapshots newest-first, scoped to the owner", async () => {
    for (let i = 0; i < MIN_SAMPLE_POSTS; i++) {
      await seedScoredPost(ownerE, "CASE_STUDY", 0.1);
    }
    await seedScoredPost(ownerE, "EDUCATIONAL", 0.9);

    // Another owner's snapshot must never appear in ownerE's overview/list.
    await seedScoredPost(ownerB, "CASE_STUDY", 0.5);

    const overview = await getAnalyticsOverview();
    expect(overview.totalSnapshots).toBe(MIN_SAMPLE_POSTS + 1);
    expect(overview.topPillar?.pillar).toBe("EDUCATIONAL");
    expect(overview.sampleGate.met).toBe(true);

    const snapshots = await getRecentAnalyticsSnapshots(5);
    expect(snapshots).toHaveLength(5);
    expect(snapshots.every((s) => s.post.pillar === "CASE_STUDY" || s.post.pillar === "EDUCATIONAL")).toBe(true);
    // capturedAt is newest-first.
    for (let i = 1; i < snapshots.length; i++) {
      expect(snapshots[i - 1]!.capturedAt.getTime()).toBeGreaterThanOrEqual(snapshots[i]!.capturedAt.getTime());
    }
  });
});
