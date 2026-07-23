import type { Pillar } from "@prisma/client";

import { requireOwner } from "@/lib/auth/require-owner";
import { prisma } from "@/lib/db/prisma";
import type { StyleMemoryForPrompt } from "@/features/generation/prompt";
import { MIN_SAMPLE_POSTS } from "./style-memory";

const MAX_EXAMPLE_HOOKS = 3;

function firstLine(text: string): string {
  return text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
}

// Loads the owner's style memory in the shape the prompt builders need, or null
// when no profile has been computed yet (below the sample threshold). Takes an
// ownerId directly — callers (the generate route, the pipeline) have already
// authenticated and pass it through.
export async function getStyleMemoryForPrompt(ownerId: string): Promise<StyleMemoryForPrompt | null> {
  const profile = await prisma.styleMemoryProfile.findUnique({
    where: { ownerId },
    include: {
      examples: {
        where: { post: { isNot: null } },
        include: { post: { select: { finalText: true } } },
        orderBy: { createdAt: "desc" },
        take: MAX_EXAMPLE_HOOKS,
      },
    },
  });

  if (!profile || profile.lastComputedAt === null) return null;

  const hookPatterns = Array.isArray(profile.hookPatterns)
    ? (profile.hookPatterns as unknown as { pattern: string; frequency: number }[])
    : [];

  const exampleHooks = profile.examples
    .map((example) => (example.post?.finalText ? firstLine(example.post.finalText) : ""))
    .filter(Boolean);

  return {
    avgSentenceLength: profile.avgSentenceLength,
    emojiUsageRate: profile.emojiUsageRate,
    hookPatterns,
    favoriteVocabulary: profile.favoriteVocabulary,
    avoidedPhrases: profile.avoidedPhrases,
    exampleHooks,
  };
}

export interface PillarPerformance {
  avgEngagementRate: number;
  sampleCount: number;
}

// Per-pillar historical engagement, computed from each PUBLISHED post's latest
// snapshot. Can't use groupBy directly (needs "latest snapshot per post" before
// grouping by pillar), so this follows the same findMany-then-reduce shape as
// recomputeStyleMemoryForOwner (features/analytics/actions.ts). Gated on total
// scored posts, same "quiet below threshold" convention as computeStyleProfile —
// below MIN_SAMPLE_POSTS this returns {} so the topic-scoring boost is a no-op.
export async function getPillarPerformance(
  ownerId: string,
): Promise<Partial<Record<Pillar, PillarPerformance>>> {
  const posts = await prisma.post.findMany({
    where: { ownerId, status: "PUBLISHED", finalText: { not: null } },
    select: {
      pillar: true,
      analytics: { orderBy: { capturedAt: "desc" }, take: 1, select: { engagementRate: true } },
    },
  });

  const scored = posts
    .map((post) => ({ pillar: post.pillar, engagementRate: post.analytics[0]?.engagementRate ?? null }))
    .filter((post): post is { pillar: Pillar; engagementRate: number } => post.engagementRate !== null);

  if (scored.length < MIN_SAMPLE_POSTS) return {};

  const totals = new Map<Pillar, { sum: number; count: number }>();
  for (const post of scored) {
    const entry = totals.get(post.pillar) ?? { sum: 0, count: 0 };
    entry.sum += post.engagementRate;
    entry.count += 1;
    totals.set(post.pillar, entry);
  }

  const performance: Partial<Record<Pillar, PillarPerformance>> = {};
  for (const [pillar, { sum, count }] of totals) {
    performance[pillar] = { avgEngagementRate: sum / count, sampleCount: count };
  }
  return performance;
}

export interface AnalyticsOverview {
  totalSnapshots: number;
  avgEngagementRate: number | null;
  topPillar: { pillar: Pillar; avgEngagementRate: number } | null;
  sampleGate: { scoredPostCount: number; threshold: number; met: boolean };
}

export async function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  const ownerId = await requireOwner();

  const [totalSnapshots, avgAgg, pillarPerformance, scoredPostCount] = await Promise.all([
    prisma.analyticsSnapshot.count({ where: { post: { ownerId } } }),
    prisma.analyticsSnapshot.aggregate({
      where: { post: { ownerId }, engagementRate: { not: null } },
      _avg: { engagementRate: true },
    }),
    getPillarPerformance(ownerId),
    // Display-only count: a post with ANY scored snapshot. Distinct from
    // getPillarPerformance's stricter latest-snapshot gate, which is what
    // actually controls the topic-scoring boost.
    prisma.post.count({
      where: {
        ownerId,
        status: "PUBLISHED",
        finalText: { not: null },
        analytics: { some: { engagementRate: { not: null } } },
      },
    }),
  ]);

  const topPillar = (Object.entries(pillarPerformance) as [Pillar, PillarPerformance][]).reduce<
    { pillar: Pillar; avgEngagementRate: number } | null
  >((best, [pillar, perf]) => {
    if (!best || perf.avgEngagementRate > best.avgEngagementRate) {
      return { pillar, avgEngagementRate: perf.avgEngagementRate };
    }
    return best;
  }, null);

  return {
    totalSnapshots,
    avgEngagementRate: avgAgg._avg.engagementRate,
    topPillar,
    sampleGate: {
      scoredPostCount,
      threshold: MIN_SAMPLE_POSTS,
      met: scoredPostCount >= MIN_SAMPLE_POSTS,
    },
  };
}

export interface RecentAnalyticsSnapshot {
  id: string;
  capturedAt: Date;
  source: string;
  engagementRate: number | null;
  impressions: number | null;
  post: { id: string; pillar: Pillar; finalText: string | null; topic: { title: string } | null };
}

export async function getRecentAnalyticsSnapshots(limit = 20): Promise<RecentAnalyticsSnapshot[]> {
  const ownerId = await requireOwner();

  return prisma.analyticsSnapshot.findMany({
    where: { post: { ownerId } },
    orderBy: { capturedAt: "desc" },
    take: limit,
    select: {
      id: true,
      capturedAt: true,
      source: true,
      engagementRate: true,
      impressions: true,
      post: {
        select: {
          id: true,
          pillar: true,
          finalText: true,
          topic: { select: { title: true } },
        },
      },
    },
  });
}
