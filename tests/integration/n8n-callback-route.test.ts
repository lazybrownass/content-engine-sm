import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { PrismaClient, type AutomationProvider, type Post, type PublishingJob } from "@prisma/client";

import { POST } from "@/app/api/webhooks/n8n/route";
import { signPayload } from "@/lib/publishing/signing";

const prisma = new PrismaClient();
const ownerA = randomUUID();
const SECRET = "test-secret";

let provider: AutomationProvider;

beforeAll(async () => {
  process.env.N8N_SIGNING_SECRET = SECRET;
  await prisma.user.create({ data: { id: ownerA, email: `n8n-callback-${ownerA}@example.com` } });
  provider = await prisma.automationProvider.create({
    data: {
      ownerId: ownerA,
      type: "N8N",
      label: "n8n",
      configRef: "https://n8n.test/hook",
      signingSecretRef: "N8N_SIGNING_SECRET",
    },
  });
});

afterAll(async () => {
  await prisma.publishingJob.deleteMany({ where: { automationProviderId: provider.id } });
  await prisma.schedule.deleteMany({ where: { post: { ownerId: ownerA } } });
  await prisma.automationProvider.deleteMany({ where: { ownerId: ownerA } });
  await prisma.post.deleteMany({ where: { ownerId: ownerA } });
  await prisma.user.deleteMany({ where: { id: ownerA } });
  await prisma.$disconnect();
  delete process.env.N8N_SIGNING_SECRET;
});

async function makeDispatchedJob(): Promise<{ post: Post; job: PublishingJob }> {
  const post = await prisma.post.create({ data: { ownerId: ownerA, pillar: "CASE_STUDY", status: "PUBLISHING" } });
  const schedule = await prisma.schedule.create({ data: { postId: post.id, scheduledAt: new Date() } });
  const job = await prisma.publishingJob.create({
    data: {
      scheduleId: schedule.id,
      automationProviderId: provider.id,
      status: "DISPATCHED",
      dispatchedAt: new Date(),
    },
  });
  return { post, job };
}

function makeRequest(body: string, signature: string | null): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature) headers["x-signature"] = signature;
  return new NextRequest("http://localhost/api/webhooks/n8n", { method: "POST", body, headers });
}

describe("POST /api/webhooks/n8n", () => {
  it("marks the job PUBLISHED and post PUBLISHED on a validly signed success callback", async () => {
    const { post, job } = await makeDispatchedJob();
    const body = JSON.stringify({ jobId: job.id, status: "success", linkedinUrl: "https://linkedin.com/post/1" });
    const signature = signPayload(body, SECRET);

    const response = await POST(makeRequest(body, signature));
    expect(response.status).toBe(200);

    const updatedJob = await prisma.publishingJob.findUnique({ where: { id: job.id } });
    expect(updatedJob?.status).toBe("PUBLISHED");
    expect(updatedJob?.linkedinUrl).toBe("https://linkedin.com/post/1");
    const updatedPost = await prisma.post.findUnique({ where: { id: post.id } });
    expect(updatedPost?.status).toBe("PUBLISHED");
  });

  it("marks the job and post FAILED on a validly signed failure callback", async () => {
    const { post, job } = await makeDispatchedJob();
    const body = JSON.stringify({ jobId: job.id, status: "failure", errorMessage: "LinkedIn rejected the post" });
    const signature = signPayload(body, SECRET);

    const response = await POST(makeRequest(body, signature));
    expect(response.status).toBe(200);

    const updatedJob = await prisma.publishingJob.findUnique({ where: { id: job.id } });
    expect(updatedJob?.status).toBe("FAILED");
    expect(updatedJob?.errorMessage).toBe("LinkedIn rejected the post");
    const updatedPost = await prisma.post.findUnique({ where: { id: post.id } });
    expect(updatedPost?.status).toBe("FAILED");
  });

  it("rejects with 401 and leaves the job untouched when the signature header is missing", async () => {
    const { job } = await makeDispatchedJob();
    const body = JSON.stringify({ jobId: job.id, status: "success" });

    const response = await POST(makeRequest(body, null));
    expect(response.status).toBe(401);

    const untouchedJob = await prisma.publishingJob.findUnique({ where: { id: job.id } });
    expect(untouchedJob?.status).toBe("DISPATCHED");
  });

  it("rejects with 401 and leaves the job untouched when the signature is wrong", async () => {
    const { job } = await makeDispatchedJob();
    const body = JSON.stringify({ jobId: job.id, status: "success" });
    const wrongSignature = signPayload(body, "not-the-real-secret");

    const response = await POST(makeRequest(body, wrongSignature));
    expect(response.status).toBe(401);

    const untouchedJob = await prisma.publishingJob.findUnique({ where: { id: job.id } });
    expect(untouchedJob?.status).toBe("DISPATCHED");
  });

  it("rejects with 401 and leaves the job untouched when the body is tampered after signing", async () => {
    const { job } = await makeDispatchedJob();
    const originalBody = JSON.stringify({ jobId: job.id, status: "success" });
    const signature = signPayload(originalBody, SECRET);
    const tamperedBody = JSON.stringify({ jobId: job.id, status: "failure" });

    const response = await POST(makeRequest(tamperedBody, signature));
    expect(response.status).toBe(401);

    const untouchedJob = await prisma.publishingJob.findUnique({ where: { id: job.id } });
    expect(untouchedJob?.status).toBe("DISPATCHED");
  });

  it("is idempotent: a second callback on an already-terminal job is a no-op", async () => {
    const { job } = await makeDispatchedJob();
    const body = JSON.stringify({ jobId: job.id, status: "success" });
    const signature = signPayload(body, SECRET);

    await POST(makeRequest(body, signature));
    const secondResponse = await POST(makeRequest(body, signature));
    expect(secondResponse.status).toBe(200);

    const finalJob = await prisma.publishingJob.findUnique({ where: { id: job.id } });
    expect(finalJob?.status).toBe("PUBLISHED");
  });
});
