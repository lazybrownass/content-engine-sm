"use server";

import type { Post } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z, type ZodSafeParseResult } from "zod";

import { AuthError, requireOwner } from "@/lib/auth/require-owner";
import { prisma } from "@/lib/db/prisma";
import { searchKnowledgeItems } from "@/features/knowledge/queries";
import { getStyleMemoryForPrompt } from "@/features/analytics/queries";
import { runPipeline } from "@/features/pipeline/orchestrator";
import { runSingleStagePipeline } from "@/features/pipeline/run-single-stage";
import { STAGE_BY_ACTION, runInlineEditStage } from "@/features/pipeline/stages/inline-edit";

import { inlineEditInputSchema, updatePostSchema } from "./schema";

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

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const idSchema = z.string().uuid();

export async function createPostFromTopic(topicId: string): Promise<ActionResult<Post>> {
  let ownerId: string;
  try {
    ownerId = await requireOwner();
  } catch (error) {
    if (error instanceof AuthError) return toUnauthorized();
    return toInternalError(error);
  }

  const parsedId = idSchema.safeParse(topicId);
  if (!parsedId.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: formatZodError(parsedId.error) },
    };
  }

  try {
    const topic = await prisma.topic.findFirst({
      where: { id: parsedId.data, ownerId, status: "SUGGESTED" },
    });
    if (!topic) {
      return { success: false, error: { code: "NOT_FOUND", message: "Topic not found" } };
    }

    const [brandVoice, knowledgeChunks, styleMemory] = await Promise.all([
      prisma.brandVoice.findFirst({ where: { ownerId, isDefault: true } }),
      searchKnowledgeItems(topic.title, 10),
      getStyleMemoryForPrompt(ownerId),
    ]);

    const post = await prisma.post.create({
      data: { ownerId, topicId: topic.id, pillar: topic.pillar, status: "PIPELINE_RUNNING" },
    });
    await prisma.topic.update({ where: { id: topic.id, ownerId }, data: { status: "ACCEPTED" } });

    const { pipelineRun, finalText } = await runPipeline({
      ownerId,
      topic: topic.title,
      brandVoice,
      knowledgeChunks,
      postId: post.id,
      topicId: topic.id,
      styleMemory,
    });

    const updated = await prisma.post.update({
      where: { id: post.id },
      data: finalText
        ? {
            finalText,
            wordCount: countWords(finalText),
            qualityScore: pipelineRun.qualityScore,
            grillCycles: pipelineRun.grillCycles,
            status: "NEEDS_OWNER_REVIEW",
          }
        : { status: "FAILED" },
    });

    revalidatePath("/topics");
    revalidatePath("/posts");
    return { success: true, data: updated };
  } catch (error) {
    return toInternalError(error);
  }
}

export async function regeneratePost(
  postId: string,
): Promise<ActionResult<{ post: Post; previousText: string | null }>> {
  let ownerId: string;
  try {
    ownerId = await requireOwner();
  } catch (error) {
    if (error instanceof AuthError) return toUnauthorized();
    return toInternalError(error);
  }

  const parsedId = idSchema.safeParse(postId);
  if (!parsedId.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: formatZodError(parsedId.error) },
    };
  }

  try {
    const post = await prisma.post.findFirst({
      where: { id: parsedId.data, ownerId },
      include: { topic: true },
    });
    if (!post) {
      return { success: false, error: { code: "NOT_FOUND", message: "Post not found" } };
    }
    if (!post.topic) {
      return {
        success: false,
        error: { code: "INVALID_STATE", message: "Post has no associated topic to regenerate from" },
      };
    }

    const previousText = post.finalText;

    const [brandVoice, knowledgeChunks] = await Promise.all([
      prisma.brandVoice.findFirst({ where: { ownerId, isDefault: true } }),
      searchKnowledgeItems(post.topic.title, 10),
    ]);

    await prisma.post.update({ where: { id: post.id }, data: { status: "PIPELINE_RUNNING" } });

    const { pipelineRun, finalText } = await runPipeline({
      ownerId,
      topic: post.topic.title,
      brandVoice,
      knowledgeChunks,
      postId: post.id,
      topicId: post.topic.id,
    });

    const updated = await prisma.post.update({
      where: { id: post.id },
      data: finalText
        ? {
            finalText,
            wordCount: countWords(finalText),
            qualityScore: pipelineRun.qualityScore,
            grillCycles: pipelineRun.grillCycles,
            status: "NEEDS_OWNER_REVIEW",
          }
        : { status: "FAILED" },
    });

    revalidatePath(`/posts/${postId}/edit`);
    revalidatePath("/posts");
    return { success: true, data: { post: updated, previousText } };
  } catch (error) {
    return toInternalError(error);
  }
}

export async function updatePost(input: unknown): Promise<ActionResult<Post>> {
  let ownerId: string;
  try {
    ownerId = await requireOwner();
  } catch (error) {
    if (error instanceof AuthError) return toUnauthorized();
    return toInternalError(error);
  }

  const parsed = updatePostSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: formatZodError(parsed.error) },
    };
  }

  const { id, finalText } = parsed.data;

  try {
    const existing = await prisma.post.findFirst({ where: { id, ownerId } });
    if (!existing) {
      return { success: false, error: { code: "NOT_FOUND", message: "Post not found" } };
    }

    const post = await prisma.post.update({
      where: { id, ownerId },
      data: {
        finalText,
        wordCount: countWords(finalText),
        status: existing.status === "NEEDS_OWNER_REVIEW" ? "IN_EDIT" : existing.status,
      },
    });

    revalidatePath(`/posts/${id}/edit`);
    revalidatePath("/posts");
    return { success: true, data: post };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { success: false, error: { code: "NOT_FOUND", message: "Post not found" } };
    }
    return toInternalError(error);
  }
}

const APPROVABLE_STATUSES = new Set(["NEEDS_OWNER_REVIEW", "IN_EDIT"]);

export async function approvePost(id: string): Promise<ActionResult<Post>> {
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
    const existing = await prisma.post.findFirst({ where: { id: parsedId.data, ownerId } });
    if (!existing) {
      return { success: false, error: { code: "NOT_FOUND", message: "Post not found" } };
    }
    if (!APPROVABLE_STATUSES.has(existing.status)) {
      return {
        success: false,
        error: { code: "INVALID_STATE", message: `Cannot approve a post with status ${existing.status}` },
      };
    }

    const post = await prisma.post.update({
      where: { id: parsedId.data, ownerId },
      data: { status: "APPROVED" },
    });

    revalidatePath(`/posts/${parsedId.data}/edit`);
    revalidatePath("/posts");
    return { success: true, data: post };
  } catch (error) {
    return toInternalError(error);
  }
}

export async function archivePost(id: string): Promise<ActionResult<Post>> {
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
    const post = await prisma.post.update({
      where: { id: parsedId.data, ownerId },
      data: { status: "ARCHIVED" },
    });
    revalidatePath("/posts");
    return { success: true, data: post };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { success: false, error: { code: "NOT_FOUND", message: "Post not found" } };
    }
    return toInternalError(error);
  }
}

export async function applyInlineEdit(input: unknown): Promise<ActionResult<{ result: string }>> {
  let ownerId: string;
  try {
    ownerId = await requireOwner();
  } catch (error) {
    if (error instanceof AuthError) return toUnauthorized();
    return toInternalError(error);
  }

  const parsed = inlineEditInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: formatZodError(parsed.error) },
    };
  }

  const { postId, action, selectedText, contextText } = parsed.data;

  try {
    const post = await prisma.post.findFirst({ where: { id: postId, ownerId } });
    if (!post) {
      return { success: false, error: { code: "NOT_FOUND", message: "Post not found" } };
    }

    const brandVoice = await prisma.brandVoice.findFirst({ where: { ownerId, isDefault: true } });

    const { output } = await runSingleStagePipeline({
      ownerId,
      stage: STAGE_BY_ACTION[action],
      postId,
      runStage: () => runInlineEditStage({ action, selectedText, contextText, brandVoice }),
    });

    return { success: true, data: { result: output.result } };
  } catch (error) {
    return toInternalError(error);
  }
}
