import type { AutomationProvider, Post, PublishingJob, Schedule } from "@prisma/client";

import { requireOwner } from "@/lib/auth/require-owner";
import { prisma } from "@/lib/db/prisma";

export type ScheduleWithPost = Schedule & { post: Post; jobs: PublishingJob[] };

export async function getSchedulesForRange(start: Date, end: Date): Promise<ScheduleWithPost[]> {
  const ownerId = await requireOwner();

  return prisma.schedule.findMany({
    where: { post: { ownerId }, scheduledAt: { gte: start, lt: end } },
    include: { post: true, jobs: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { scheduledAt: "asc" },
  });
}

export async function getSchedulableApprovedPosts(): Promise<Post[]> {
  const ownerId = await requireOwner();

  return prisma.post.findMany({
    where: { ownerId, status: "APPROVED", schedule: null },
    orderBy: { createdAt: "desc" },
  });
}

export async function getAutomationProviders(): Promise<AutomationProvider[]> {
  const ownerId = await requireOwner();

  return prisma.automationProvider.findMany({ where: { ownerId }, orderBy: { createdAt: "asc" } });
}

export type UnconfirmedJob = PublishingJob & { schedule: Schedule & { post: Post } };

export async function getUnconfirmedJobs(): Promise<UnconfirmedJob[]> {
  const ownerId = await requireOwner();

  return prisma.publishingJob.findMany({
    where: { status: "PUBLISH_UNCONFIRMED", automationProvider: { ownerId } },
    include: { schedule: { include: { post: true } } },
    orderBy: { dispatchedAt: "asc" },
  });
}
