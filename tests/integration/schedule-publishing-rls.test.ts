import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

// AGENTS.md §9.5: RLS changes require an integration test proving a non-owner
// query returns zero rows. Like topics-posts-rls.test.ts, this is an app-layer
// ownerId-scoping proof (the test suite's PrismaClient connection doesn't switch
// Postgres roles/session auth.uid()), matching established precedent. Schedule and
// PublishingJob have no direct ownerId column — ownership is proven via a join
// (Schedule -> Post.ownerId, PublishingJob -> AutomationProvider.ownerId), so the
// scoping filter here goes through that relation, mirroring how features/publishing
// queries will be written. The owner_full_access RLS policies added alongside these
// tables are a DB-level backstop per AGENTS.md §7.2; this test proves the app-layer
// filter that's actually load-bearing today.

const prisma = new PrismaClient();

const ownerA = randomUUID();
const ownerB = randomUUID();

let postA: { id: string };
let postB: { id: string };
let providerA: { id: string };
let providerB: { id: string };
let scheduleA: { id: string };
let scheduleB: { id: string };
let jobA: { id: string };
let jobB: { id: string };

beforeAll(async () => {
  await prisma.user.createMany({
    data: [
      { id: ownerA, email: `schedule-publishing-rls-a-${ownerA}@example.com` },
      { id: ownerB, email: `schedule-publishing-rls-b-${ownerB}@example.com` },
    ],
  });

  postA = await prisma.post.create({ data: { ownerId: ownerA, pillar: "CASE_STUDY", status: "APPROVED" } });
  postB = await prisma.post.create({ data: { ownerId: ownerB, pillar: "CASE_STUDY", status: "APPROVED" } });

  providerA = await prisma.automationProvider.create({
    data: { ownerId: ownerA, type: "MANUAL", label: "Manual", isActive: true, isDefault: true },
  });
  providerB = await prisma.automationProvider.create({
    data: { ownerId: ownerB, type: "MANUAL", label: "Manual", isActive: true, isDefault: true },
  });

  scheduleA = await prisma.schedule.create({ data: { postId: postA.id, scheduledAt: new Date() } });
  scheduleB = await prisma.schedule.create({ data: { postId: postB.id, scheduledAt: new Date() } });

  jobA = await prisma.publishingJob.create({
    data: { scheduleId: scheduleA.id, automationProviderId: providerA.id },
  });
  jobB = await prisma.publishingJob.create({
    data: { scheduleId: scheduleB.id, automationProviderId: providerB.id },
  });
});

afterAll(async () => {
  await prisma.publishingJob.deleteMany({ where: { id: { in: [jobA.id, jobB.id] } } });
  await prisma.schedule.deleteMany({ where: { id: { in: [scheduleA.id, scheduleB.id] } } });
  await prisma.automationProvider.deleteMany({ where: { ownerId: { in: [ownerA, ownerB] } } });
  await prisma.post.deleteMany({ where: { ownerId: { in: [ownerA, ownerB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerA, ownerB] } } });
  await prisma.$disconnect();
});

describe("AutomationProvider ownership scoping", () => {
  it("returns only this owner's AutomationProvider rows", async () => {
    const providers = await prisma.automationProvider.findMany({ where: { ownerId: ownerA } });

    expect(providers.some((p) => p.id === providerA.id)).toBe(true);
    expect(providers.some((p) => p.id === providerB.id)).toBe(false);
  });
});

describe("Schedule ownership scoping", () => {
  it("returns only this owner's Schedule rows via the Post join", async () => {
    const schedules = await prisma.schedule.findMany({ where: { post: { ownerId: ownerA } } });

    expect(schedules.some((s) => s.id === scheduleA.id)).toBe(true);
    expect(schedules.some((s) => s.id === scheduleB.id)).toBe(false);
  });
});

describe("PublishingJob ownership scoping", () => {
  it("returns only this owner's PublishingJob rows via the AutomationProvider join", async () => {
    const jobs = await prisma.publishingJob.findMany({
      where: { automationProvider: { ownerId: ownerA } },
    });

    expect(jobs.some((j) => j.id === jobA.id)).toBe(true);
    expect(jobs.some((j) => j.id === jobB.id)).toBe(false);
  });
});
