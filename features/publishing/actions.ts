"use server";

import type { AutomationProvider, Post, PublishingJob } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { type ZodSafeParseResult } from "zod";

import { AuthError, requireOwner } from "@/lib/auth/require-owner";
import { prisma } from "@/lib/db/prisma";

import { publishingProviders } from "./providers/registry";
import {
  cancelScheduleSchema,
  confirmManualPublishSchema,
  createAutomationProviderSchema,
  resolveUnconfirmedSchema,
  retryJobSchema,
  scheduleInputSchema,
  testAutomationProviderSchema,
} from "./schema";

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

function isRecordNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

const SCHEDULABLE_POST_STATUSES = new Set(["APPROVED", "FAILED"]);

export async function schedulePost(
  input: unknown,
): Promise<ActionResult<{ post: Post; job: PublishingJob }>> {
  let ownerId: string;
  try {
    ownerId = await requireOwner();
  } catch (error) {
    if (error instanceof AuthError) return toUnauthorized();
    return toInternalError(error);
  }

  const parsed = scheduleInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: formatZodError(parsed.error) } };
  }
  const { postId, scheduledAt, timezone, automationProviderId } = parsed.data;

  try {
    const post = await prisma.post.findFirst({ where: { id: postId, ownerId } });
    if (!post) {
      return { success: false, error: { code: "NOT_FOUND", message: "Post not found" } };
    }
    if (!SCHEDULABLE_POST_STATUSES.has(post.status)) {
      return {
        success: false,
        error: { code: "INVALID_STATE", message: `Cannot schedule a post with status ${post.status}` },
      };
    }

    const automationProvider = await prisma.automationProvider.findFirst({
      where: { id: automationProviderId, ownerId },
    });
    if (!automationProvider) {
      return { success: false, error: { code: "NOT_FOUND", message: "Automation provider not found" } };
    }

    const schedule = await prisma.schedule.upsert({
      where: { postId },
      create: { postId, scheduledAt, timezone },
      update: { scheduledAt, timezone },
    });

    const previousJobCount = await prisma.publishingJob.count({ where: { scheduleId: schedule.id } });
    const job = await prisma.publishingJob.create({
      data: {
        scheduleId: schedule.id,
        automationProviderId: automationProvider.id,
        attempt: previousJobCount + 1,
      },
    });

    const updatedPost = await prisma.post.update({
      where: { id: postId, ownerId },
      data: { status: "SCHEDULED" },
    });

    revalidatePath("/schedule");
    revalidatePath("/posts");
    return { success: true, data: { post: updatedPost, job } };
  } catch (error) {
    return toInternalError(error);
  }
}

export async function cancelSchedule(input: unknown): Promise<ActionResult<Post>> {
  let ownerId: string;
  try {
    ownerId = await requireOwner();
  } catch (error) {
    if (error instanceof AuthError) return toUnauthorized();
    return toInternalError(error);
  }

  const parsed = cancelScheduleSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: formatZodError(parsed.error) } };
  }
  const { postId } = parsed.data;

  try {
    const post = await prisma.post.findFirst({
      where: { id: postId, ownerId },
      include: { schedule: { include: { jobs: true } } },
    });
    if (!post) {
      return { success: false, error: { code: "NOT_FOUND", message: "Post not found" } };
    }
    if (post.status !== "SCHEDULED") {
      return {
        success: false,
        error: { code: "INVALID_STATE", message: `Cannot cancel a post with status ${post.status}` },
      };
    }

    const pendingJob = post.schedule?.jobs.find((job) => job.status === "SCHEDULED");
    if (pendingJob) {
      await prisma.publishingJob.update({ where: { id: pendingJob.id }, data: { status: "CANCELLED" } });
    }

    const updatedPost = await prisma.post.update({
      where: { id: postId, ownerId },
      data: { status: "APPROVED" },
    });

    revalidatePath("/schedule");
    revalidatePath("/posts");
    return { success: true, data: updatedPost };
  } catch (error) {
    return toInternalError(error);
  }
}

export async function retryPublishingJob(
  input: unknown,
): Promise<ActionResult<{ post: Post; job: PublishingJob }>> {
  let ownerId: string;
  try {
    ownerId = await requireOwner();
  } catch (error) {
    if (error instanceof AuthError) return toUnauthorized();
    return toInternalError(error);
  }

  const parsed = retryJobSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: formatZodError(parsed.error) } };
  }
  const { jobId, scheduledAt, automationProviderId } = parsed.data;

  try {
    const job = await prisma.publishingJob.findFirst({
      where: { id: jobId, automationProvider: { ownerId } },
      include: { schedule: true },
    });
    if (!job) {
      return { success: false, error: { code: "NOT_FOUND", message: "Publishing job not found" } };
    }
    if (job.status !== "FAILED") {
      return {
        success: false,
        error: { code: "INVALID_STATE", message: `Cannot retry a job with status ${job.status}` },
      };
    }

    if (automationProviderId) {
      const provider = await prisma.automationProvider.findFirst({
        where: { id: automationProviderId, ownerId },
      });
      if (!provider) {
        return { success: false, error: { code: "NOT_FOUND", message: "Automation provider not found" } };
      }
    }

    if (scheduledAt) {
      await prisma.schedule.update({ where: { id: job.scheduleId }, data: { scheduledAt } });
    }

    const newJob = await prisma.publishingJob.create({
      data: {
        scheduleId: job.scheduleId,
        automationProviderId: automationProviderId ?? job.automationProviderId,
        attempt: job.attempt + 1,
      },
    });

    const updatedPost = await prisma.post.update({
      where: { id: job.schedule.postId },
      data: { status: "SCHEDULED" },
    });

    revalidatePath("/schedule");
    revalidatePath("/posts");
    return { success: true, data: { post: updatedPost, job: newJob } };
  } catch (error) {
    return toInternalError(error);
  }
}

export async function confirmManualPublish(input: unknown): Promise<ActionResult<Post>> {
  let ownerId: string;
  try {
    ownerId = await requireOwner();
  } catch (error) {
    if (error instanceof AuthError) return toUnauthorized();
    return toInternalError(error);
  }

  const parsed = confirmManualPublishSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: formatZodError(parsed.error) } };
  }
  const { jobId, linkedinUrl } = parsed.data;

  try {
    const job = await prisma.publishingJob.findFirst({
      where: { id: jobId, automationProvider: { ownerId, type: "MANUAL" } },
      include: { schedule: true },
    });
    if (!job) {
      return { success: false, error: { code: "NOT_FOUND", message: "Publishing job not found" } };
    }
    if (job.status !== "DISPATCHED") {
      return {
        success: false,
        error: { code: "INVALID_STATE", message: `Cannot confirm a job with status ${job.status}` },
      };
    }

    await prisma.publishingJob.update({
      where: { id: job.id },
      data: { status: "PUBLISHED", confirmedAt: new Date(), linkedinUrl: linkedinUrl ?? null },
    });
    const updatedPost = await prisma.post.update({
      where: { id: job.schedule.postId },
      data: { status: "PUBLISHED" },
    });

    revalidatePath("/schedule");
    revalidatePath("/posts");
    return { success: true, data: updatedPost };
  } catch (error) {
    return toInternalError(error);
  }
}

export async function resolvePublishUnconfirmed(input: unknown): Promise<ActionResult<Post>> {
  let ownerId: string;
  try {
    ownerId = await requireOwner();
  } catch (error) {
    if (error instanceof AuthError) return toUnauthorized();
    return toInternalError(error);
  }

  const parsed = resolveUnconfirmedSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: formatZodError(parsed.error) } };
  }
  const { jobId, outcome, linkedinUrl } = parsed.data;

  try {
    const job = await prisma.publishingJob.findFirst({
      where: { id: jobId, automationProvider: { ownerId } },
      include: { schedule: true },
    });
    if (!job) {
      return { success: false, error: { code: "NOT_FOUND", message: "Publishing job not found" } };
    }
    if (job.status !== "PUBLISH_UNCONFIRMED") {
      return {
        success: false,
        error: { code: "INVALID_STATE", message: `Cannot resolve a job with status ${job.status}` },
      };
    }

    const resolvedStatus = outcome === "published" ? "PUBLISHED" : "FAILED";
    await prisma.publishingJob.update({
      where: { id: job.id },
      data: {
        status: resolvedStatus,
        confirmedAt: outcome === "published" ? new Date() : null,
        linkedinUrl: outcome === "published" ? (linkedinUrl ?? null) : null,
      },
    });
    const updatedPost = await prisma.post.update({
      where: { id: job.schedule.postId },
      data: { status: resolvedStatus },
    });

    revalidatePath("/schedule");
    revalidatePath("/posts");
    return { success: true, data: updatedPost };
  } catch (error) {
    return toInternalError(error);
  }
}

export async function createAutomationProvider(
  input: unknown,
): Promise<ActionResult<AutomationProvider>> {
  let ownerId: string;
  try {
    ownerId = await requireOwner();
  } catch (error) {
    if (error instanceof AuthError) return toUnauthorized();
    return toInternalError(error);
  }

  const parsed = createAutomationProviderSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: formatZodError(parsed.error) } };
  }
  const { type, label, configRef, signingSecretRef } = parsed.data;

  try {
    const provider = await prisma.automationProvider.create({
      data: { ownerId, type, label, configRef, signingSecretRef, isActive: false, isDefault: false },
    });

    revalidatePath("/schedule");
    return { success: true, data: provider };
  } catch (error) {
    return toInternalError(error);
  }
}

export async function testAutomationProvider(input: unknown): Promise<ActionResult<AutomationProvider>> {
  let ownerId: string;
  try {
    ownerId = await requireOwner();
  } catch (error) {
    if (error instanceof AuthError) return toUnauthorized();
    return toInternalError(error);
  }

  const parsed = testAutomationProviderSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: formatZodError(parsed.error) } };
  }
  const { id } = parsed.data;

  try {
    const provider = await prisma.automationProvider.findFirst({ where: { id, ownerId } });
    if (!provider) {
      return { success: false, error: { code: "NOT_FOUND", message: "Automation provider not found" } };
    }

    const result = await publishingProviders[provider.type].ping(provider);

    const updated = await prisma.automationProvider.update({
      where: { id },
      data: {
        lastTestedAt: new Date(),
        lastTestOk: result.ok,
        ...(result.ok && { isActive: true }),
      },
    });

    revalidatePath("/schedule");
    return { success: true, data: updated };
  } catch (error) {
    if (isRecordNotFound(error)) {
      return { success: false, error: { code: "NOT_FOUND", message: "Automation provider not found" } };
    }
    return toInternalError(error);
  }
}
