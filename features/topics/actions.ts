"use server";

import type { Topic } from "@prisma/client";
import { Prisma, PipelineStage } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z, type ZodSafeParseResult } from "zod";

import { AuthError, requireOwner } from "@/lib/auth/require-owner";
import { prisma } from "@/lib/db/prisma";
import { getKnowledgeItems, getKnowledgeStats } from "@/features/knowledge/queries";
import type { KnowledgeSearchItemResult } from "@/features/knowledge/queries";
import { getPillarPerformance, getStyleMemoryForPrompt } from "@/features/analytics/queries";
import { applyPillarScoreBoost } from "@/features/analytics/pillar-scoring";
import { runSingleStagePipeline } from "@/features/pipeline/run-single-stage";
import { runTopicGenerationStage } from "@/features/pipeline/stages/topic-generation";

import { getRecentTopicTitles } from "./queries";
import { updateTopicSchema } from "./schema";

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

function buildKnowledgeStatsSummary(stats: Awaited<ReturnType<typeof getKnowledgeStats>>): string {
  const byCategory =
    Object.entries(stats.byCategory)
      .map(([category, count]) => `${category}=${count}`)
      .join(", ") || "(none)";
  const byPillar =
    Object.entries(stats.byPillar)
      .map(([pillar, count]) => `${pillar}=${count}`)
      .join(", ") || "(none)";

  return [
    `Total knowledge items: ${stats.total}`,
    `By category: ${byCategory}`,
    `By pillar: ${byPillar}`,
  ].join("\n");
}

export async function generateTopicSuggestions(): Promise<ActionResult<Topic[]>> {
  let ownerId: string;
  try {
    ownerId = await requireOwner();
  } catch (error) {
    if (error instanceof AuthError) return toUnauthorized();
    return toInternalError(error);
  }

  try {
    const [stats, existingTitles, sample, pillarPerformance, styleMemory] = await Promise.all([
      getKnowledgeStats(),
      getRecentTopicTitles(),
      getKnowledgeItems({ archived: false, limit: 20 }),
      getPillarPerformance(ownerId),
      getStyleMemoryForPrompt(ownerId),
    ]);

    const knowledgeChunks: KnowledgeSearchItemResult[] = sample.items.map((item) => ({
      item,
      matchedContent: item.body.slice(0, 800),
      score: 1,
    }));

    const { output } = await runSingleStagePipeline({
      ownerId,
      stage: PipelineStage.TOPIC_GENERATION,
      runStage: () =>
        runTopicGenerationStage({
          knowledgeStatsSummary: buildKnowledgeStatsSummary(stats),
          existingTitles,
          knowledgeChunks,
          pillarPerformance: Object.entries(pillarPerformance).map(([pillar, perf]) => ({
            pillar,
            ...perf,
          })),
          hookPatterns: styleMemory?.hookPatterns,
        }),
    });

    // Boost/dampen raw LLM scores by historical pillar performance before anything
    // downstream reads suggestion.score — a no-op below the sample threshold.
    const boostedSuggestions = applyPillarScoreBoost(output.suggestions, pillarPerformance);

    // Defend against a hallucinated knowledge id: only keep ids that really exist
    // and belong to this owner.
    const referencedIds = [...new Set(boostedSuggestions.flatMap((s) => s.sourceKnowledgeIds))];
    const validItems =
      referencedIds.length > 0
        ? await prisma.knowledgeItem.findMany({
            where: { id: { in: referencedIds }, ownerId },
            select: { id: true },
          })
        : [];
    const validIds = new Set(validItems.map((item) => item.id));

    const created = await prisma.topic.createManyAndReturn({
      data: boostedSuggestions.map((suggestion) => ({
        ownerId,
        title: suggestion.title,
        rationale: suggestion.rationale,
        pillar: suggestion.pillar,
        sourceKnowledgeIds: suggestion.sourceKnowledgeIds.filter((id) => validIds.has(id)),
        score: suggestion.score,
      })),
    });

    revalidatePath("/topics");
    return { success: true, data: created };
  } catch (error) {
    return toInternalError(error);
  }
}

export async function updateTopic(input: unknown): Promise<ActionResult<Topic>> {
  let ownerId: string;
  try {
    ownerId = await requireOwner();
  } catch (error) {
    if (error instanceof AuthError) return toUnauthorized();
    return toInternalError(error);
  }

  const parsed = updateTopicSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: formatZodError(parsed.error) },
    };
  }

  const { id, ...rest } = parsed.data;

  try {
    const topic = await prisma.topic.update({
      where: { id, ownerId, status: "SUGGESTED" },
      data: rest,
    });
    revalidatePath("/topics");
    return { success: true, data: topic };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { success: false, error: { code: "NOT_FOUND", message: "Topic not found" } };
    }
    return toInternalError(error);
  }
}

const idSchema = z.string().uuid();

export async function rejectTopic(id: string): Promise<ActionResult<Topic>> {
  let ownerId: string;
  try {
    ownerId = await requireOwner();
  } catch (error) {
    if (error instanceof AuthError) return toUnauthorized();
    return toInternalError(error);
  }

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: formatZodError(parsedId.error) },
    };
  }

  try {
    const topic = await prisma.topic.update({
      where: { id: parsedId.data, ownerId, status: "SUGGESTED" },
      data: { status: "REJECTED" },
    });
    revalidatePath("/topics");
    return { success: true, data: topic };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { success: false, error: { code: "NOT_FOUND", message: "Topic not found" } };
    }
    return toInternalError(error);
  }
}
