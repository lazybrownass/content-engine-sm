import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient, type AutomationProvider, type Post } from "@prisma/client";

import { requireOwner } from "@/lib/auth/require-owner";
import {
  cancelSchedule,
  confirmManualPublish,
  createAutomationProvider,
  resolvePublishUnconfirmed,
  retryPublishingJob,
  schedulePost,
  testAutomationProvider,
} from "@/features/publishing/actions";

vi.mock("@/lib/auth/require-owner", () => ({
  requireOwner: vi.fn(),
  AuthError: class AuthError extends Error {},
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/publishing/providers/registry", () => ({
  publishingProviders: {
    MANUAL: { type: "MANUAL", dispatch: vi.fn(), ping: vi.fn(async () => ({ ok: true })) },
    N8N: { type: "N8N", dispatch: vi.fn(), ping: vi.fn(async () => ({ ok: false, errorMessage: "boom" })) },
    MAKE: { type: "MAKE", dispatch: vi.fn(), ping: vi.fn(async () => ({ ok: true })) },
  },
}));

const prisma = new PrismaClient();

const ownerA = randomUUID();
const ownerB = randomUUID();

let manualProviderA: AutomationProvider;
let n8nProviderA: AutomationProvider;
let manualProviderB: AutomationProvider;

beforeAll(async () => {
  await prisma.user.createMany({
    data: [
      { id: ownerA, email: `schedule-actions-a-${ownerA}@example.com` },
      { id: ownerB, email: `schedule-actions-b-${ownerB}@example.com` },
    ],
  });

  manualProviderA = await prisma.automationProvider.create({
    data: { ownerId: ownerA, type: "MANUAL", label: "Manual", isActive: true, isDefault: true },
  });
  n8nProviderA = await prisma.automationProvider.create({
    data: {
      ownerId: ownerA,
      type: "N8N",
      label: "n8n",
      configRef: "https://n8n.example.com/hook",
      signingSecretRef: "N8N_SIGNING_SECRET",
    },
  });
  manualProviderB = await prisma.automationProvider.create({
    data: { ownerId: ownerB, type: "MANUAL", label: "Manual", isActive: true, isDefault: true },
  });
});

afterAll(async () => {
  await prisma.publishingJob.deleteMany({
    where: { automationProviderId: { in: [manualProviderA.id, n8nProviderA.id, manualProviderB.id] } },
  });
  await prisma.schedule.deleteMany({ where: { post: { ownerId: { in: [ownerA, ownerB] } } } });
  await prisma.automationProvider.deleteMany({ where: { ownerId: { in: [ownerA, ownerB] } } });
  await prisma.post.deleteMany({ where: { ownerId: { in: [ownerA, ownerB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerA, ownerB] } } });
  await prisma.$disconnect();
});

async function makePost(ownerId: string, overrides: Partial<Post> = {}) {
  return prisma.post.create({ data: { ownerId, pillar: "CASE_STUDY", status: "APPROVED", ...overrides } });
}

describe("schedulePost", () => {
  beforeEach(() => {
    vi.mocked(requireOwner).mockResolvedValue(ownerA);
  });

  it("schedules an APPROVED post with the manual provider", async () => {
    const post = await makePost(ownerA);
    const result = await schedulePost({
      postId: post.id,
      scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
      automationProviderId: manualProviderA.id,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.post.status).toBe("SCHEDULED");
    expect(result.data.job.status).toBe("SCHEDULED");
    expect(result.data.job.attempt).toBe(1);
  });

  it("refuses to schedule a DRAFT post", async () => {
    const post = await makePost(ownerA, { status: "DRAFT" });
    const result = await schedulePost({
      postId: post.id,
      scheduledAt: new Date().toISOString(),
      automationProviderId: manualProviderA.id,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("INVALID_STATE");
  });

  it("rejects an automationProviderId belonging to another owner", async () => {
    const post = await makePost(ownerA);
    const result = await schedulePost({
      postId: post.id,
      scheduledAt: new Date().toISOString(),
      automationProviderId: manualProviderB.id,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });

  it("does not schedule another owner's post", async () => {
    const post = await makePost(ownerB);
    const result = await schedulePost({
      postId: post.id,
      scheduledAt: new Date().toISOString(),
      automationProviderId: manualProviderA.id,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });
});

describe("cancelSchedule", () => {
  beforeEach(() => {
    vi.mocked(requireOwner).mockResolvedValue(ownerA);
  });

  it("cancels a SCHEDULED post's pending job and reverts to APPROVED", async () => {
    const post = await makePost(ownerA);
    const scheduled = await schedulePost({
      postId: post.id,
      scheduledAt: new Date().toISOString(),
      automationProviderId: manualProviderA.id,
    });
    if (!scheduled.success) throw new Error("setup failed");

    const result = await cancelSchedule({ postId: post.id });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.status).toBe("APPROVED");

    const job = await prisma.publishingJob.findUnique({ where: { id: scheduled.data.job.id } });
    expect(job?.status).toBe("CANCELLED");
  });

  it("refuses to cancel a post that isn't SCHEDULED", async () => {
    const post = await makePost(ownerA);
    const result = await cancelSchedule({ postId: post.id });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("INVALID_STATE");
  });
});

describe("retryPublishingJob", () => {
  beforeEach(() => {
    vi.mocked(requireOwner).mockResolvedValue(ownerA);
  });

  it("creates a new attempt for a FAILED job and re-schedules the post", async () => {
    const post = await makePost(ownerA);
    const scheduled = await schedulePost({
      postId: post.id,
      scheduledAt: new Date().toISOString(),
      automationProviderId: manualProviderA.id,
    });
    if (!scheduled.success) throw new Error("setup failed");
    await prisma.publishingJob.update({ where: { id: scheduled.data.job.id }, data: { status: "FAILED" } });
    await prisma.post.update({ where: { id: post.id }, data: { status: "FAILED" } });

    const result = await retryPublishingJob({ jobId: scheduled.data.job.id });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.job.attempt).toBe(2);
    expect(result.data.post.status).toBe("SCHEDULED");
  });

  it("refuses to retry a job that isn't FAILED", async () => {
    const post = await makePost(ownerA);
    const scheduled = await schedulePost({
      postId: post.id,
      scheduledAt: new Date().toISOString(),
      automationProviderId: manualProviderA.id,
    });
    if (!scheduled.success) throw new Error("setup failed");

    const result = await retryPublishingJob({ jobId: scheduled.data.job.id });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("INVALID_STATE");
  });

  it("does not retry a job belonging to another owner's automation provider", async () => {
    vi.mocked(requireOwner).mockResolvedValue(ownerB);
    const postB = await makePost(ownerB);
    const scheduledB = await schedulePost({
      postId: postB.id,
      scheduledAt: new Date().toISOString(),
      automationProviderId: manualProviderB.id,
    });
    if (!scheduledB.success) throw new Error("setup failed");
    await prisma.publishingJob.update({ where: { id: scheduledB.data.job.id }, data: { status: "FAILED" } });

    vi.mocked(requireOwner).mockResolvedValue(ownerA);
    const result = await retryPublishingJob({ jobId: scheduledB.data.job.id });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });
});

describe("confirmManualPublish", () => {
  beforeEach(() => {
    vi.mocked(requireOwner).mockResolvedValue(ownerA);
  });

  it("marks a DISPATCHED manual job PUBLISHED", async () => {
    const post = await makePost(ownerA);
    const scheduled = await schedulePost({
      postId: post.id,
      scheduledAt: new Date().toISOString(),
      automationProviderId: manualProviderA.id,
    });
    if (!scheduled.success) throw new Error("setup failed");
    await prisma.publishingJob.update({ where: { id: scheduled.data.job.id }, data: { status: "DISPATCHED" } });

    const result = await confirmManualPublish({
      jobId: scheduled.data.job.id,
      linkedinUrl: "https://linkedin.com/post/1",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.status).toBe("PUBLISHED");
  });

  it("refuses to confirm a job that isn't DISPATCHED", async () => {
    const post = await makePost(ownerA);
    const scheduled = await schedulePost({
      postId: post.id,
      scheduledAt: new Date().toISOString(),
      automationProviderId: manualProviderA.id,
    });
    if (!scheduled.success) throw new Error("setup failed");

    const result = await confirmManualPublish({ jobId: scheduled.data.job.id });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("INVALID_STATE");
  });
});

describe("resolvePublishUnconfirmed", () => {
  beforeEach(() => {
    vi.mocked(requireOwner).mockResolvedValue(ownerA);
  });

  it("resolves an unconfirmed n8n job to PUBLISHED", async () => {
    const post = await makePost(ownerA);
    const scheduled = await schedulePost({
      postId: post.id,
      scheduledAt: new Date().toISOString(),
      automationProviderId: n8nProviderA.id,
    });
    if (!scheduled.success) throw new Error("setup failed");
    await prisma.publishingJob.update({
      where: { id: scheduled.data.job.id },
      data: { status: "PUBLISH_UNCONFIRMED" },
    });

    const result = await resolvePublishUnconfirmed({
      jobId: scheduled.data.job.id,
      outcome: "published",
      linkedinUrl: "https://linkedin.com/post/2",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.status).toBe("PUBLISHED");
  });

  it("resolves an unconfirmed job to FAILED", async () => {
    const post = await makePost(ownerA);
    const scheduled = await schedulePost({
      postId: post.id,
      scheduledAt: new Date().toISOString(),
      automationProviderId: n8nProviderA.id,
    });
    if (!scheduled.success) throw new Error("setup failed");
    await prisma.publishingJob.update({
      where: { id: scheduled.data.job.id },
      data: { status: "PUBLISH_UNCONFIRMED" },
    });

    const result = await resolvePublishUnconfirmed({ jobId: scheduled.data.job.id, outcome: "failed" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.status).toBe("FAILED");
  });
});

describe("createAutomationProvider / testAutomationProvider", () => {
  beforeEach(() => {
    vi.mocked(requireOwner).mockResolvedValue(ownerA);
  });

  it("creates an N8N provider, inactive until tested", async () => {
    const result = await createAutomationProvider({
      type: "N8N",
      label: "Test n8n",
      configRef: "https://n8n.example.com/hook2",
      signingSecretRef: "N8N_SIGNING_SECRET",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.isActive).toBe(false);
  });

  it("activates the provider on a successful ping", async () => {
    const created = await createAutomationProvider({
      type: "MAKE",
      label: "Test make",
      configRef: "https://make.example.com/hook",
      signingSecretRef: "MAKE_SIGNING_SECRET",
    });
    if (!created.success) throw new Error("setup failed");

    const result = await testAutomationProvider({ id: created.data.id });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.isActive).toBe(true);
    expect(result.data.lastTestOk).toBe(true);
  });

  it("leaves the provider inactive on a failed ping", async () => {
    const created = await createAutomationProvider({
      type: "N8N",
      label: "Test n8n 2",
      configRef: "https://n8n.example.com/hook3",
      signingSecretRef: "N8N_SIGNING_SECRET",
    });
    if (!created.success) throw new Error("setup failed");

    const result = await testAutomationProvider({ id: created.data.id });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.isActive).toBe(false);
    expect(result.data.lastTestOk).toBe(false);
  });
});
