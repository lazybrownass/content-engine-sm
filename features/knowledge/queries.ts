import type { KnowledgeCategory, KnowledgeItem, Pillar, Prisma } from "@prisma/client";
import { z } from "zod";

import { requireOwner } from "@/lib/auth/require-owner";
import { prisma } from "@/lib/db/prisma";

import { queryKnowledgeItemsSchema } from "./schema";

function formatZodError(issues: z.core.$ZodIssue[]): string {
  return issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
}

export async function getKnowledgeItems(
  input: unknown,
): Promise<{ items: KnowledgeItem[]; nextCursor: string | null }> {
  const ownerId = await requireOwner();

  const parsed = queryKnowledgeItemsSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(formatZodError(parsed.error.issues));
  }

  const { category, pillar, archived, search, limit, cursor } = parsed.data;

  const where: Prisma.KnowledgeItemWhereInput = {
    ownerId,
    archived,
    ...(category && { category }),
    ...(pillar && { pillarHints: { has: pillar } }),
    ...(search && {
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { body: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  const results = await prisma.knowledgeItem.findMany({
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

export async function getKnowledgeItemById(id: string): Promise<KnowledgeItem | null> {
  const ownerId = await requireOwner();

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    throw new Error(formatZodError(parsedId.error.issues));
  }

  return prisma.knowledgeItem.findFirst({
    where: { id: parsedId.data, ownerId },
  });
}

export async function getKnowledgeStats(): Promise<{
  total: number;
  byCategory: Partial<Record<KnowledgeCategory, number>>;
  byPillar: Partial<Record<Pillar, number>>;
}> {
  const ownerId = await requireOwner();

  const [categoryGroups, pillarRows] = await Promise.all([
    prisma.knowledgeItem.groupBy({
      by: ["category"],
      where: { ownerId, archived: false },
      _count: true,
    }),
    prisma.knowledgeItem.findMany({
      where: { ownerId, archived: false },
      select: { pillarHints: true },
    }),
  ]);

  const byCategory: Partial<Record<KnowledgeCategory, number>> = {};
  let total = 0;
  for (const group of categoryGroups) {
    byCategory[group.category] = group._count;
    total += group._count;
  }

  const byPillar: Partial<Record<Pillar, number>> = {};
  for (const row of pillarRows) {
    for (const pillar of row.pillarHints) {
      byPillar[pillar] = (byPillar[pillar] ?? 0) + 1;
    }
  }

  return { total, byCategory, byPillar };
}
