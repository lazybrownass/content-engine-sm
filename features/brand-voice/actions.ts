"use server";

import type { BrandVoice } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { type ZodSafeParseResult } from "zod";

import { AuthError, requireOwner } from "@/lib/auth/require-owner";
import { prisma } from "@/lib/db/prisma";

import {
  createBrandVoiceSchema,
  setDefaultBrandVoiceSchema,
  updateBrandVoiceSchema,
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

export async function createBrandVoice(input: unknown): Promise<ActionResult<BrandVoice>> {
  let ownerId: string;
  try {
    ownerId = await requireOwner();
  } catch (error) {
    if (error instanceof AuthError) return toUnauthorized();
    return toInternalError(error);
  }

  const parsed = createBrandVoiceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: formatZodError(parsed.error) },
    };
  }

  try {
    const voice = parsed.data.isDefault
      ? await prisma.$transaction(async (tx) => {
          await tx.brandVoice.updateMany({ where: { ownerId, isDefault: true }, data: { isDefault: false } });
          return tx.brandVoice.create({ data: { ...parsed.data, ownerId } });
        })
      : await prisma.brandVoice.create({ data: { ...parsed.data, ownerId } });

    revalidatePath("/generate");
    return { success: true, data: voice };
  } catch (error) {
    return toInternalError(error);
  }
}

export async function updateBrandVoice(input: unknown): Promise<ActionResult<BrandVoice>> {
  let ownerId: string;
  try {
    ownerId = await requireOwner();
  } catch (error) {
    if (error instanceof AuthError) return toUnauthorized();
    return toInternalError(error);
  }

  const parsed = updateBrandVoiceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: formatZodError(parsed.error) },
    };
  }

  const { id, ...rest } = parsed.data;

  try {
    const voice = rest.isDefault
      ? await prisma.$transaction(async (tx) => {
          await tx.brandVoice.updateMany({
            where: { ownerId, isDefault: true, id: { not: id } },
            data: { isDefault: false },
          });
          return tx.brandVoice.update({ where: { id, ownerId }, data: rest });
        })
      : await prisma.brandVoice.update({ where: { id, ownerId }, data: rest });

    revalidatePath("/generate");
    return { success: true, data: voice };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { success: false, error: { code: "NOT_FOUND", message: "Brand voice not found" } };
    }
    return toInternalError(error);
  }
}

export async function setDefaultBrandVoice(id: string): Promise<ActionResult<BrandVoice>> {
  let ownerId: string;
  try {
    ownerId = await requireOwner();
  } catch (error) {
    if (error instanceof AuthError) return toUnauthorized();
    return toInternalError(error);
  }

  const parsedId = setDefaultBrandVoiceSchema.safeParse(id);
  if (!parsedId.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: formatZodError(parsedId.error) },
    };
  }

  try {
    const voice = await prisma.$transaction(async (tx) => {
      await tx.brandVoice.updateMany({
        where: { ownerId, isDefault: true, id: { not: parsedId.data } },
        data: { isDefault: false },
      });
      return tx.brandVoice.update({
        where: { id: parsedId.data, ownerId },
        data: { isDefault: true },
      });
    });

    revalidatePath("/generate");
    return { success: true, data: voice };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { success: false, error: { code: "NOT_FOUND", message: "Brand voice not found" } };
    }
    return toInternalError(error);
  }
}

export async function deleteBrandVoice(id: string): Promise<ActionResult<BrandVoice>> {
  let ownerId: string;
  try {
    ownerId = await requireOwner();
  } catch (error) {
    if (error instanceof AuthError) return toUnauthorized();
    return toInternalError(error);
  }

  const parsedId = setDefaultBrandVoiceSchema.safeParse(id);
  if (!parsedId.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: formatZodError(parsedId.error) },
    };
  }

  try {
    const voice = await prisma.brandVoice.delete({ where: { id: parsedId.data, ownerId } });
    revalidatePath("/generate");
    return { success: true, data: voice };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { success: false, error: { code: "NOT_FOUND", message: "Brand voice not found" } };
    }
    return toInternalError(error);
  }
}
