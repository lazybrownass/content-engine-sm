"use server";

import type { AnalyticsSnapshot, StyleMemoryProfile } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { type ZodSafeParseResult } from "zod";

import { AuthError, requireOwner } from "@/lib/auth/require-owner";
import { prisma } from "@/lib/db/prisma";

import { logAnalyticsInputSchema, deriveEngagementRate } from "./schema";
import { computeStyleProfile, type StyleSamplePost } from "./style-memory";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

function formatZodError(error: ZodSafeParseResult<unknown>["error"]): string {
  return (error?.issues ?? [])
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
}

function toUnauthorized<T>(): ActionResult<T> {
  return { success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } };
}

function toInternalError<T>(error: unknown): ActionResult<T> {
  console.error(error);
  return { success: false, error: { code: "INTERNAL_ERROR", message: "Something went wrong" } };
}

// Recomputes and persists the owner's StyleMemoryProfile from their published posts'
// latest engagement metrics. Internal helper (not a server action) so it can run both
// inline after an analytics write and behind the explicit recompute action below. The
// cron bypasses RLS, so ownership is enforced here by scoping every query to ownerId.
async function recomputeStyleMemoryForOwner(ownerId: string): Promise<StyleMemoryProfile> {
  const posts = await prisma.post.findMany({
    where: { ownerId, status: "PUBLISHED", finalText: { not: null } },
    orderBy: { updatedAt: "desc" },
    include: { analytics: { orderBy: { capturedAt: "desc" }, take: 1 } },
  });

  const samples: StyleSamplePost[] = posts.map((post) => ({
    id: post.id,
    finalText: post.finalText ?? "",
    engagementRate: post.analytics[0]?.engagementRate ?? null,
  }));

  const computed = computeStyleProfile(samples);

  // Shared column values for the upsert; JSON fields cast to Prisma's input type.
  const profileFields = {
    avgSentenceLength: computed.avgSentenceLength,
    emojiUsageRate: computed.emojiUsageRate,
    hookPatterns: computed.hookPatterns as unknown as Prisma.InputJsonValue,
    ctaPatterns: computed.ctaPatterns as unknown as Prisma.InputJsonValue,
    favoriteVocabulary: computed.favoriteVocabulary,
    avoidedPhrases: computed.avoidedPhrases,
    repeatedPhraseIndex: computed.repeatedPhraseIndex as Prisma.InputJsonValue,
    lastComputedAt: new Date(),
  };

  const profile = await prisma.styleMemoryProfile.upsert({
    where: { ownerId },
    create: { ownerId, ...profileFields },
    update: profileFields,
  });

  // Replace the winning-example set wholesale — it's small and always reflects the
  // latest top performers.
  await prisma.$transaction([
    prisma.styleMemoryExample.deleteMany({ where: { styleMemoryProfileId: profile.id } }),
    prisma.styleMemoryExample.createMany({
      data: computed.winnerPostIds.map((postId) => ({
        styleMemoryProfileId: profile.id,
        postId,
        note: "Top-performing published post by engagement rate.",
      })),
    }),
  ]);

  return profile;
}

export async function logAnalyticsSnapshot(
  input: unknown,
): Promise<ActionResult<AnalyticsSnapshot>> {
  let ownerId: string;
  try {
    ownerId = await requireOwner();
  } catch (error) {
    if (error instanceof AuthError) return toUnauthorized();
    return toInternalError(error);
  }

  const parsed = logAnalyticsInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: formatZodError(parsed.error) },
    };
  }

  try {
    // Ownership re-check beyond RLS: the post must belong to this owner.
    const post = await prisma.post.findFirst({
      where: { id: parsed.data.postId, ownerId },
      select: { id: true },
    });
    if (!post) {
      return { success: false, error: { code: "NOT_FOUND", message: "Post not found" } };
    }

    const snapshot = await prisma.analyticsSnapshot.create({
      data: {
        postId: post.id,
        source: parsed.data.source,
        impressions: parsed.data.impressions ?? null,
        reactions: parsed.data.reactions ?? null,
        comments: parsed.data.comments ?? null,
        reposts: parsed.data.reposts ?? null,
        clicks: parsed.data.clicks ?? null,
        engagementRate: deriveEngagementRate(parsed.data),
      },
    });

    // Close the loop immediately so the profile reflects the new metric.
    await recomputeStyleMemoryForOwner(ownerId);

    revalidatePath("/posts");
    return { success: true, data: snapshot };
  } catch (error) {
    return toInternalError(error);
  }
}

export async function recomputeStyleMemory(): Promise<ActionResult<StyleMemoryProfile>> {
  let ownerId: string;
  try {
    ownerId = await requireOwner();
  } catch (error) {
    if (error instanceof AuthError) return toUnauthorized();
    return toInternalError(error);
  }

  try {
    const profile = await recomputeStyleMemoryForOwner(ownerId);
    return { success: true, data: profile };
  } catch (error) {
    return toInternalError(error);
  }
}
