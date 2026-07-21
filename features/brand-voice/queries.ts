import type { BrandVoice } from "@prisma/client";
import { z } from "zod";

import { requireOwner } from "@/lib/auth/require-owner";
import { prisma } from "@/lib/db/prisma";

function formatZodError(issues: z.core.$ZodIssue[]): string {
  return issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
}

export async function getBrandVoices(): Promise<BrandVoice[]> {
  const ownerId = await requireOwner();

  return prisma.brandVoice.findMany({
    where: { ownerId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
}

const idSchema = z.string().uuid();

export async function getBrandVoiceById(id: string): Promise<BrandVoice | null> {
  const ownerId = await requireOwner();

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    throw new Error(formatZodError(parsedId.error.issues));
  }

  return prisma.brandVoice.findFirst({
    where: { id: parsedId.data, ownerId },
  });
}

export async function getDefaultBrandVoice(): Promise<BrandVoice | null> {
  const ownerId = await requireOwner();

  return prisma.brandVoice.findFirst({
    where: { ownerId, isDefault: true },
  });
}
