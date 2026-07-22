import type { Prisma, Topic } from "@prisma/client";
import { z } from "zod";

import { requireOwner } from "@/lib/auth/require-owner";
import { prisma } from "@/lib/db/prisma";

import { queryTopicsSchema } from "./schema";

function formatZodError(issues: z.core.$ZodIssue[]): string {
  return issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
}

export async function getTopics(
  input: unknown,
): Promise<{ items: Topic[]; nextCursor: string | null }> {
  const ownerId = await requireOwner();

  const parsed = queryTopicsSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(formatZodError(parsed.error.issues));
  }

  const { status, pillar, limit, cursor } = parsed.data;

  const where: Prisma.TopicWhereInput = {
    ownerId,
    ...(status && { status }),
    ...(pillar && { pillar }),
  };

  const results = await prisma.topic.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  });

  const hasMore = results.length > limit;
  const items = hasMore ? results.slice(0, limit) : results;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return { items, nextCursor };
}

const idSchema = z.string().uuid();

export async function getTopicById(id: string): Promise<Topic | null> {
  const ownerId = await requireOwner();

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    throw new Error(formatZodError(parsedId.error.issues));
  }

  return prisma.topic.findFirst({ where: { id: parsedId.data, ownerId } });
}

export async function getRecentTopicTitles(limit = 50): Promise<string[]> {
  const ownerId = await requireOwner();

  const topics = await prisma.topic.findMany({
    where: { ownerId },
    select: { title: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return topics.map((topic) => topic.title);
}
