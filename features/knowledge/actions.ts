"use server";

import type { KnowledgeItem } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z, type ZodSafeParseResult } from "zod";

import { AuthError, requireOwner } from "@/lib/auth/require-owner";
import { prisma } from "@/lib/db/prisma";

import { createKnowledgeItemSchema, updateKnowledgeItemSchema } from "./schema";

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

export async function createKnowledgeItem(
  input: unknown,
): Promise<ActionResult<KnowledgeItem>> {
  let ownerId: string;
  try {
    ownerId = await requireOwner();
  } catch (error) {
    if (error instanceof AuthError) return toUnauthorized();
    return toInternalError(error);
  }

  const parsed = createKnowledgeItemSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: formatZodError(parsed.error) },
    };
  }

  try {
    const item = await prisma.knowledgeItem.create({
      data: { ...parsed.data, ownerId },
    });
    revalidatePath("/knowledge");
    return { success: true, data: item };
  } catch (error) {
    return toInternalError(error);
  }
}

export async function updateKnowledgeItem(
  input: unknown,
): Promise<ActionResult<KnowledgeItem>> {
  let ownerId: string;
  try {
    ownerId = await requireOwner();
  } catch (error) {
    if (error instanceof AuthError) return toUnauthorized();
    return toInternalError(error);
  }

  const parsed = updateKnowledgeItemSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: formatZodError(parsed.error) },
    };
  }

  const { id, ...rest } = parsed.data;

  try {
    const item = await prisma.knowledgeItem.update({
      where: { id, ownerId },
      data: rest,
    });
    revalidatePath("/knowledge");
    revalidatePath(`/knowledge/${id}`);
    return { success: true, data: item };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Knowledge item not found" },
      };
    }
    return toInternalError(error);
  }
}

const archiveIdSchema = z.string().uuid();

export async function archiveKnowledgeItem(id: string): Promise<ActionResult<KnowledgeItem>> {
  let ownerId: string;
  try {
    ownerId = await requireOwner();
  } catch (error) {
    if (error instanceof AuthError) return toUnauthorized();
    return toInternalError(error);
  }

  const parsedId = archiveIdSchema.safeParse(id);
  if (!parsedId.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: formatZodError(parsedId.error) },
    };
  }

  try {
    const item = await prisma.knowledgeItem.update({
      where: { id: parsedId.data, ownerId },
      data: { archived: true },
    });
    revalidatePath("/knowledge");
    revalidatePath(`/knowledge/${parsedId.data}`);
    return { success: true, data: item };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Knowledge item not found" },
      };
    }
    return toInternalError(error);
  }
}

export async function bulkImportKnowledgeItems(
  items: unknown[],
): Promise<
  ActionResult<{ created: KnowledgeItem[]; rejected: { row: number; error: string }[] }>
> {
  let ownerId: string;
  try {
    ownerId = await requireOwner();
  } catch (error) {
    if (error instanceof AuthError) return toUnauthorized();
    return toInternalError(error);
  }

  const toCreate: Prisma.KnowledgeItemCreateManyInput[] = [];
  const rejected: { row: number; error: string }[] = [];

  items.forEach((item, index) => {
    const parsed = createKnowledgeItemSchema.safeParse(item);
    if (parsed.success) {
      toCreate.push({ ...parsed.data, ownerId });
    } else {
      rejected.push({ row: index, error: formatZodError(parsed.error) });
    }
  });

  if (toCreate.length === 0) {
    return { success: true, data: { created: [], rejected } };
  }

  try {
    const created = await prisma.knowledgeItem.createManyAndReturn({
      data: toCreate,
    });
    revalidatePath("/knowledge");
    return { success: true, data: { created, rejected } };
  } catch (error) {
    return toInternalError(error);
  }
}
