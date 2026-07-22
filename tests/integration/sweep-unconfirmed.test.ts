import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type AutomationProvider, type Post, type PublishingJob } from "@prisma/client";

import { sweepUnconfirmedPublishingJobs } from "@/lib/publishing/dispatch-due-jobs";

const prisma = new PrismaClient();
const ownerA = randomUUID();

let n8nProvider: AutomationProvider;
let manualProvider: AutomationProvider;

beforeAll(async () => {
  await prisma.user.create({ data: { id: ownerA, email: `sweep-unconfirmed-${ownerA}@example.com` } });
  n8nProvider = await prisma.automationProvider.create({
    data: {
      ownerId: ownerA,
      type: "N8N",
      label: "n8n",
      configRef: "https://n8n.test/hook",
      signingSecretRef: "N8N_SIGNING_SECRET",
    },
  });
  manualProvider = await prisma.automationProvider.create({
    data: { ownerId: ownerA, type: "MANUAL", label: "Manual", isActive: true, isDefault: true },
  });
});

afterEach(() => {
  delete process.env.PUBLISHING_CALLBACK_TIMEOUT_MINUTES;
});

afterAll(async () => {
  await prisma.publishingJob.deleteMany({
    where: { automationProviderId: { in: [n8nProvider.id, manualProvider.id] } },
  });
  await prisma.schedule.deleteMany({ where: { post: { ownerId: ownerA } } });
  await prisma.automationProvider.deleteMany({ where: { ownerId: ownerA } });
  await prisma.post.deleteMany({ where: { ownerId: ownerA } });
  await prisma.user.deleteMany({ where: { id: ownerA } });
  await prisma.$disconnect();
});

async function makeDispatchedJob(
  automationProviderId: string,
  dispatchedAt: Date,
): Promise<{ post: Post; job: PublishingJob }> {
  const post = await prisma.post.create({ data: { ownerId: ownerA, pillar: "CASE_STUDY", status: "PUBLISHING" } });
  const schedule = await prisma.schedule.create({ data: { postId: post.id, scheduledAt: new Date() } });
  const job = await prisma.publishingJob.create({
    data: { scheduleId: schedule.id, automationProviderId, status: "DISPATCHED", dispatchedAt },
  });
  return { post, job };
}

describe("sweepUnconfirmedPublishingJobs", () => {
  it("flips a stale N8N DISPATCHED job to PUBLISH_UNCONFIRMED", async () => {
    process.env.PUBLISHING_CALLBACK_TIMEOUT_MINUTES = "30";
    const staleDate = new Date(Date.now() - 31 * 60_000);
    const { post, job } = await makeDispatchedJob(n8nProvider.id, staleDate);

    const result = await sweepUnconfirmedPublishingJobs();

    expect(result.swept).toBeGreaterThanOrEqual(1);
    const updatedJob = await prisma.publishingJob.findUnique({ where: { id: job.id } });
    expect(updatedJob?.status).toBe("PUBLISH_UNCONFIRMED");
    const updatedPost = await prisma.post.findUnique({ where: { id: post.id } });
    expect(updatedPost?.status).toBe("PUBLISH_UNCONFIRMED");
  });

  it("leaves a recent N8N DISPATCHED job untouched", async () => {
    process.env.PUBLISHING_CALLBACK_TIMEOUT_MINUTES = "30";
    const recentDate = new Date(Date.now() - 5 * 60_000);
    const { job } = await makeDispatchedJob(n8nProvider.id, recentDate);

    await sweepUnconfirmedPublishingJobs();

    const updatedJob = await prisma.publishingJob.findUnique({ where: { id: job.id } });
    expect(updatedJob?.status).toBe("DISPATCHED");
  });

  it("never sweeps a MANUAL job regardless of age", async () => {
    process.env.PUBLISHING_CALLBACK_TIMEOUT_MINUTES = "30";
    const staleDate = new Date(Date.now() - 999 * 60_000);
    const { job } = await makeDispatchedJob(manualProvider.id, staleDate);

    await sweepUnconfirmedPublishingJobs();

    const updatedJob = await prisma.publishingJob.findUnique({ where: { id: job.id } });
    expect(updatedJob?.status).toBe("DISPATCHED");
  });
});
