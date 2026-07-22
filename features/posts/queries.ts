import type { Post, Prisma, Topic } from "@prisma/client";
import { z } from "zod";

import { requireOwner } from "@/lib/auth/require-owner";
import { prisma } from "@/lib/db/prisma";

import { queryPostsSchema } from "./schema";

function formatZodError(issues: z.core.$ZodIssue[]): string {
  return issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
}

export type PostWithTopic = Post & { topic: Topic | null };

export async function getPosts(
  input: unknown,
): Promise<{ items: PostWithTopic[]; nextCursor: string | null }> {
  const ownerId = await requireOwner();

  const parsed = queryPostsSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(formatZodError(parsed.error.issues));
  }

  const { status, pillar, limit, cursor } = parsed.data;

  const where: Prisma.PostWhereInput = {
    ownerId,
    ...(status && { status }),
    ...(pillar && { pillar }),
  };

  const results = await prisma.post.findMany({
    where,
    include: { topic: true },
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

export async function getPostById(id: string): Promise<PostWithTopic | null> {
  const ownerId = await requireOwner();

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    throw new Error(formatZodError(parsedId.error.issues));
  }

  return prisma.post.findFirst({
    where: { id: parsedId.data, ownerId },
    include: { topic: true },
  });
}
