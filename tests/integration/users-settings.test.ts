import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

describe("users/settings schema", () => {
  it("creates a user and an associated settings row, and cascades delete", async () => {
    const userId = randomUUID();
    const email = `test-${userId}@example.com`;

    const user = await prisma.user.create({
      data: { id: userId, email },
    });
    expect(user.email).toBe(email);

    const settings = await prisma.settings.create({
      data: { ownerId: userId },
    });
    expect(settings.ownerId).toBe(userId);
    expect(settings.weeklyPostingGoalMin).toBe(3);
    expect(settings.weeklyPostingGoalMax).toBe(5);

    await prisma.user.delete({ where: { id: userId } });
    const orphanedSettings = await prisma.settings.findUnique({
      where: { ownerId: userId },
    });
    expect(orphanedSettings).toBeNull();
  });

  it("rejects a duplicate email", async () => {
    const email = `dup-${randomUUID()}@example.com`;
    await prisma.user.create({ data: { id: randomUUID(), email } });

    await expect(
      prisma.user.create({ data: { id: randomUUID(), email } }),
    ).rejects.toThrow();
  });
});
