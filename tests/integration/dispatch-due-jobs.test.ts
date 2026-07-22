import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type AutomationProvider } from "@prisma/client";
import { HttpResponse, delay, http } from "msw";
import { setupServer } from "msw/node";

import { dispatchDuePublishingJobs } from "@/lib/publishing/dispatch-due-jobs";

const prisma = new PrismaClient();
const server = setupServer();

const ownerA = randomUUID();
const N8N_URL = "https://n8n.test/hook";

let n8nProvider: AutomationProvider;

beforeAll(async () => {
  server.listen({ onUnhandledRequest: "error" });
  process.env.N8N_SIGNING_SECRET = "test-secret";
  process.env.APP_BASE_URL = "https://app.test";

  await prisma.user.create({ data: { id: ownerA, email: `dispatch-due-jobs-${ownerA}@example.com` } });
  n8nProvider = await prisma.automationProvider.create({
    data: {
      ownerId: ownerA,
      type: "N8N",
      label: "n8n",
      configRef: N8N_URL,
      signingSecretRef: "N8N_SIGNING_SECRET",
    },
  });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(async () => {
  server.close();
  await prisma.publishingJob.deleteMany({ where: { automationProviderId: n8nProvider.id } });
  await prisma.schedule.deleteMany({ where: { post: { ownerId: ownerA } } });
  await prisma.automationProvider.deleteMany({ where: { ownerId: ownerA } });
  await prisma.post.deleteMany({ where: { ownerId: ownerA } });
  await prisma.user.deleteMany({ where: { id: ownerA } });
  await prisma.$disconnect();
  delete process.env.N8N_SIGNING_SECRET;
  delete process.env.APP_BASE_URL;
});

async function makeDueJob(): Promise<{ postId: string; jobId: string }> {
  const post = await prisma.post.create({ data: { ownerId: ownerA, pillar: "CASE_STUDY", status: "SCHEDULED" } });
  const schedule = await prisma.schedule.create({
    data: { postId: post.id, scheduledAt: new Date(Date.now() - 60_000) },
  });
  const job = await prisma.publishingJob.create({
    data: { scheduleId: schedule.id, automationProviderId: n8nProvider.id },
  });
  return { postId: post.id, jobId: job.id };
}

describe("dispatchDuePublishingJobs", () => {
  it("marks a job DISPATCHED and the post PUBLISHING on a 2xx response", async () => {
    server.use(http.post(N8N_URL, () => HttpResponse.json({ ok: true })));

    const { jobId, postId } = await makeDueJob();
    const result = await dispatchDuePublishingJobs({ maxJobs: 1 });

    expect(result.dispatched).toBe(1);
    const job = await prisma.publishingJob.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe("DISPATCHED");
    expect(job?.dispatchedAt).not.toBeNull();
    const post = await prisma.post.findUnique({ where: { id: postId } });
    expect(post?.status).toBe("PUBLISHING");
  });

  it("marks a job FAILED on a non-2xx response", async () => {
    server.use(http.post(N8N_URL, () => new HttpResponse(null, { status: 500 })));

    const { jobId, postId } = await makeDueJob();
    const result = await dispatchDuePublishingJobs({ maxJobs: 1 });

    expect(result.failed).toBe(1);
    const job = await prisma.publishingJob.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe("FAILED");
    expect(job?.errorMessage).toContain("500");
    const post = await prisma.post.findUnique({ where: { id: postId } });
    expect(post?.status).toBe("FAILED");
  });

  it("marks a job FAILED on a timeout", async () => {
    process.env.PUBLISHING_DISPATCH_TIMEOUT_MS = "50";
    server.use(
      http.post(N8N_URL, async () => {
        await delay(200);
        return HttpResponse.json({ ok: true });
      }),
    );

    const { jobId } = await makeDueJob();
    const result = await dispatchDuePublishingJobs({ maxJobs: 1 });

    expect(result.failed).toBe(1);
    const job = await prisma.publishingJob.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe("FAILED");
    delete process.env.PUBLISHING_DISPATCH_TIMEOUT_MS;
  });

  it("fails a job whose post owner and provider owner do not match, without dispatching", async () => {
    let dispatchCalled = false;
    server.use(
      http.post(N8N_URL, () => {
        dispatchCalled = true;
        return HttpResponse.json({ ok: true });
      }),
    );

    const ownerB = randomUUID();
    await prisma.user.create({ data: { id: ownerB, email: `dispatch-mismatch-${ownerB}@example.com` } });
    const post = await prisma.post.create({ data: { ownerId: ownerB, pillar: "CASE_STUDY", status: "SCHEDULED" } });
    const schedule = await prisma.schedule.create({
      data: { postId: post.id, scheduledAt: new Date(Date.now() - 60_000) },
    });
    const job = await prisma.publishingJob.create({
      data: { scheduleId: schedule.id, automationProviderId: n8nProvider.id },
    });

    const result = await dispatchDuePublishingJobs({ maxJobs: 1 });

    expect(result.failed).toBe(1);
    expect(dispatchCalled).toBe(false);
    const updatedJob = await prisma.publishingJob.findUnique({ where: { id: job.id } });
    expect(updatedJob?.status).toBe("FAILED");
    expect(updatedJob?.errorMessage).toMatch(/owner/i);

    await prisma.publishingJob.delete({ where: { id: job.id } });
    await prisma.schedule.delete({ where: { id: schedule.id } });
    await prisma.post.delete({ where: { id: post.id } });
    await prisma.user.delete({ where: { id: ownerB } });
  });
});
