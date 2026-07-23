"use server";

import { AuthError, requireOwner } from "@/lib/auth/require-owner";
import { prisma } from "@/lib/db/prisma";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

function toUnauthorized<T>(): ActionResult<T> {
  return { success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } };
}

// Per docs/01-PRD.md's data-portability requirement: one JSON export of every owner-scoped
// record — knowledge base, posts, and the pipeline/model-routing history behind them — so
// none of this is ever locked into the app. Returned as an already-serialized JSON string
// (not a plain object) since Prisma's Decimal fields (AiRun.costUsd) don't reliably survive
// a Server Action's RSC serialization boundary as class instances.
export async function exportAccountData(): Promise<ActionResult<string>> {
  let ownerId: string;
  try {
    ownerId = await requireOwner();
  } catch (error) {
    if (error instanceof AuthError) return toUnauthorized();
    console.error(error);
    return { success: false, error: { code: "INTERNAL_ERROR", message: "Something went wrong" } };
  }

  const [
    settings,
    knowledgeItems,
    posts,
    topics,
    brandVoices,
    pipelineRuns,
    analyticsSnapshots,
    styleMemoryProfile,
  ] = await Promise.all([
    prisma.settings.findUnique({ where: { ownerId } }),
    prisma.knowledgeItem.findMany({
      where: { ownerId },
      include: { chunks: { select: { id: true, ordinal: true, content: true, embeddingStatus: true } } },
    }),
    prisma.post.findMany({ where: { ownerId } }),
    prisma.topic.findMany({ where: { ownerId } }),
    prisma.brandVoice.findMany({ where: { ownerId } }),
    prisma.pipelineRun.findMany({ where: { ownerId }, include: { aiRuns: true } }),
    prisma.analyticsSnapshot.findMany({ where: { post: { ownerId } } }),
    prisma.styleMemoryProfile.findUnique({ where: { ownerId }, include: { examples: true } }),
  ]);

  const json = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      settings,
      knowledgeItems,
      posts,
      topics,
      brandVoices,
      pipelineRuns,
      analyticsSnapshots,
      styleMemoryProfile,
    },
    null,
    2,
  );

  return { success: true, data: json };
}
