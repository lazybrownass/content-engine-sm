import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { MockLanguageModelV2 } from "ai/test";

vi.mock("@/lib/ai/model-router", () => ({ getModel: vi.fn() }));
vi.mock("@/lib/knowledge/search", () => ({ searchKnowledge: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({
  requireOwner: vi.fn(),
  AuthError: class AuthError extends Error {},
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getModel } from "@/lib/ai/model-router";
import { searchKnowledge } from "@/lib/knowledge/search";
import { requireOwner } from "@/lib/auth/require-owner";
import { createPostFromTopic, regeneratePost } from "@/features/posts/actions";

// Per ai/AGENTS.md §9.3, never assert on real model output in CI — every model
// call in this file is mocked.

const prisma = new PrismaClient();
const owner = randomUUID();

beforeAll(async () => {
  await prisma.user.create({ data: { id: owner, email: `create-post-${owner}@example.com` } });
  vi.mocked(requireOwner).mockResolvedValue(owner);
  vi.mocked(searchKnowledge).mockResolvedValue([]);
});

afterAll(async () => {
  await prisma.pipelineRun.deleteMany({ where: { ownerId: owner } });
  await prisma.post.deleteMany({ where: { ownerId: owner } });
  await prisma.topic.deleteMany({ where: { ownerId: owner } });
  await prisma.user.deleteMany({ where: { id: owner } });
  await prisma.$disconnect();
});

function sequencedMockModel(responses: string[], modelId = "mock-model") {
  let callIndex = 0;
  return new MockLanguageModelV2({
    modelId,
    doGenerate: async () => {
      const text = responses[Math.min(callIndex, responses.length - 1)]!;
      callIndex += 1;
      return {
        content: [{ type: "text", text }],
        finishReason: "stop",
        usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
        warnings: [],
      };
    },
  });
}

function mockGetModel({
  outline,
  draft,
  grillReview,
}: {
  outline: MockLanguageModelV2;
  draft: MockLanguageModelV2;
  grillReview: MockLanguageModelV2;
}) {
  vi.mocked(getModel).mockImplementation((purpose) => {
    if (purpose === "outline") return outline;
    if (purpose === "draft") return draft;
    return grillReview;
  });
}

describe("createPostFromTopic", () => {
  it("creates a NEEDS_OWNER_REVIEW post from an accepted topic and flips the topic to ACCEPTED", async () => {
    const topic = await prisma.topic.create({
      data: { ownerId: owner, title: "Ship in public", rationale: "r", pillar: "FOUNDER_STORY" },
    });

    mockGetModel({
      outline: sequencedMockModel([JSON.stringify({ sections: ["Hook", "Body", "CTA"] })]),
      draft: sequencedMockModel([JSON.stringify({ content: "Full drafted post." })]),
      grillReview: sequencedMockModel([JSON.stringify({ qualityScore: 92, violations: [] })]),
    });

    const result = await createPostFromTopic(topic.id);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.status).toBe("NEEDS_OWNER_REVIEW");
    expect(result.data.finalText).toBe("Full drafted post.");
    expect(result.data.qualityScore).toBe(92);
    expect(result.data.topicId).toBe(topic.id);

    const updatedTopic = await prisma.topic.findUnique({ where: { id: topic.id } });
    expect(updatedTopic?.status).toBe("ACCEPTED");
  });

  it("marks the post FAILED when the pipeline fails, without touching topic status first", async () => {
    const topic = await prisma.topic.create({
      data: { ownerId: owner, title: "Another topic", rationale: "r", pillar: "FOUNDER_STORY" },
    });

    mockGetModel({
      outline: sequencedMockModel(["not valid json {", "still not valid {"]),
      draft: sequencedMockModel([JSON.stringify({ content: "Unused" })]),
      grillReview: sequencedMockModel([JSON.stringify({ qualityScore: 90, violations: [] })]),
    });

    const result = await createPostFromTopic(topic.id);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.status).toBe("FAILED");
    expect(result.data.finalText).toBeNull();
  });

  it("returns NOT_FOUND for a topic that is not SUGGESTED", async () => {
    const topic = await prisma.topic.create({
      data: {
        ownerId: owner,
        title: "Already accepted",
        rationale: "r",
        pillar: "FOUNDER_STORY",
        status: "ACCEPTED",
      },
    });

    const result = await createPostFromTopic(topic.id);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });
});

describe("regeneratePost", () => {
  it("overwrites finalText and returns the previous text", async () => {
    const topic = await prisma.topic.create({
      data: { ownerId: owner, title: "Regen topic", rationale: "r", pillar: "FOUNDER_STORY", status: "ACCEPTED" },
    });
    const post = await prisma.post.create({
      data: {
        ownerId: owner,
        topicId: topic.id,
        pillar: "FOUNDER_STORY",
        status: "NEEDS_OWNER_REVIEW",
        finalText: "Original draft.",
      },
    });

    mockGetModel({
      outline: sequencedMockModel([JSON.stringify({ sections: ["Hook", "Body"] })]),
      draft: sequencedMockModel([JSON.stringify({ content: "Regenerated draft." })]),
      grillReview: sequencedMockModel([JSON.stringify({ qualityScore: 88, violations: [] })]),
    });

    const result = await regeneratePost(post.id);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.previousText).toBe("Original draft.");
    expect(result.data.post.finalText).toBe("Regenerated draft.");
  });
});
