import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

import { requireOwner } from "@/lib/auth/require-owner";
import {
  createBrandVoice,
  updateBrandVoice,
  setDefaultBrandVoice,
  deleteBrandVoice,
} from "@/features/brand-voice/actions";
import { getBrandVoices, getDefaultBrandVoice } from "@/features/brand-voice/queries";

vi.mock("@/lib/auth/require-owner", () => ({
  requireOwner: vi.fn(),
  AuthError: class AuthError extends Error {},
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const prisma = new PrismaClient();

const ownerA = randomUUID();
const ownerB = randomUUID();

beforeAll(async () => {
  await prisma.user.createMany({
    data: [
      { id: ownerA, email: `owner-a-${ownerA}@example.com` },
      { id: ownerB, email: `owner-b-${ownerB}@example.com` },
    ],
  });
});

afterAll(async () => {
  await prisma.brandVoice.deleteMany({ where: { ownerId: { in: [ownerA, ownerB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerA, ownerB] } } });
  await prisma.$disconnect();
});

describe("brand voice actions", () => {
  beforeEach(() => {
    vi.mocked(requireOwner).mockResolvedValue(ownerA);
  });

  it("createBrandVoice creates an owner-scoped voice", async () => {
    const result = await createBrandVoice({ name: "Direct & Confident" });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.ownerId).toBe(ownerA);
    expect(result.data.isDefault).toBe(false);
  });

  it("createBrandVoice rejects invalid input", async () => {
    const result = await createBrandVoice({ name: "" });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("creating a second default voice unsets the previous default", async () => {
    const first = await createBrandVoice({ name: "First Voice", isDefault: true });
    expect(first.success).toBe(true);
    if (!first.success) return;

    const second = await createBrandVoice({ name: "Second Voice", isDefault: true });
    expect(second.success).toBe(true);
    if (!second.success) return;

    const firstRow = await prisma.brandVoice.findUnique({ where: { id: first.data.id } });
    expect(firstRow?.isDefault).toBe(false);
    expect(second.data.isDefault).toBe(true);

    const defaultVoice = await getDefaultBrandVoice();
    expect(defaultVoice?.id).toBe(second.data.id);
  });

  it("setDefaultBrandVoice moves the default flag atomically", async () => {
    const a = await createBrandVoice({ name: "Voice A", isDefault: true });
    const b = await createBrandVoice({ name: "Voice B" });
    expect(a.success && b.success).toBe(true);
    if (!a.success || !b.success) return;

    const result = await setDefaultBrandVoice(b.data.id);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.isDefault).toBe(true);

    const voices = await getBrandVoices();
    const defaults = voices.filter((v) => v.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0]?.id).toBe(b.data.id);
  });

  it("updateBrandVoice does not update another owner's voice", async () => {
    const created = await createBrandVoice({ name: "Belongs to owner A" });
    expect(created.success).toBe(true);
    if (!created.success) return;

    vi.mocked(requireOwner).mockResolvedValue(ownerB);
    const result = await updateBrandVoice({ id: created.data.id, name: "Hijacked" });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("NOT_FOUND");

    const row = await prisma.brandVoice.findUnique({ where: { id: created.data.id } });
    expect(row?.name).toBe("Belongs to owner A");
  });

  it("deleteBrandVoice does not delete another owner's voice", async () => {
    const created = await createBrandVoice({ name: "Belongs to owner A" });
    expect(created.success).toBe(true);
    if (!created.success) return;

    vi.mocked(requireOwner).mockResolvedValue(ownerB);
    const result = await deleteBrandVoice(created.data.id);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("NOT_FOUND");

    const row = await prisma.brandVoice.findUnique({ where: { id: created.data.id } });
    expect(row).not.toBeNull();
  });

  it("getBrandVoices never returns another owner's voices", async () => {
    await createBrandVoice({ name: "Owner A's voice" });

    vi.mocked(requireOwner).mockResolvedValue(ownerB);
    const voices = await getBrandVoices();

    expect(voices.every((v) => v.ownerId === ownerB)).toBe(true);
    expect(voices.some((v) => v.name === "Owner A's voice")).toBe(false);
  });
});
