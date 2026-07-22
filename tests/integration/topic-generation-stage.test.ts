import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { MockLanguageModelV2 } from "ai/test";

vi.mock("@/lib/ai/model-router", () => ({ getModel: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({
  requireOwner: vi.fn(),
  AuthError: class AuthError extends Error {},
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getModel } from "@/lib/ai/model-router";
import { requireOwner } from "@/lib/auth/require-owner";
import { generateTopicSuggestions } from "@/features/topics/actions";

// Per ai/AGENTS.md §9.3, never assert on real model output in CI — every model
// call in this file is mocked. Per §9.2, every pipeline stage's malformed-JSON
// retry-then-fail path gets a test.

const prisma = new PrismaClient();
const owner = randomUUID();

beforeAll(async () => {
  await prisma.user.create({ data: { id: owner, email: `topic-gen-${owner}@example.com` } });
  vi.mocked(requireOwner).mockResolvedValue(owner);
});

afterAll(async () => {
  await prisma.topic.deleteMany({ where: { ownerId: owner } });
  await prisma.pipelineRun.deleteMany({ where: { ownerId: owner } });
  await prisma.knowledgeItem.deleteMany({ where: { ownerId: owner } });
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

describe("generateTopicSuggestions", () => {
  it("creates Topic rows and sanitizes a hallucinated sourceKnowledgeIds entry", async () => {
    const item = await prisma.knowledgeItem.create({
      data: {
        ownerId: owner,
        category: "CASE_STUDY",
        title: "Real knowledge item",
        body: "Some real content.",
      },
    });

    vi.mocked(getModel).mockReturnValue(
      sequencedMockModel([
        JSON.stringify({
          suggestions: [
            {
              title: "A generated topic",
              rationale: "Fills a gap.",
              pillar: "CASE_STUDY",
              sourceKnowledgeIds: [item.id, randomUUID()],
              score: 0.7,
            },
          ],
        }),
      ]),
    );

    const result = await generateTopicSuggestions();

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.title).toBe("A generated topic");
    // The hallucinated id is dropped; only the real item id survives.
    expect(result.data[0]?.sourceKnowledgeIds).toEqual([item.id]);

    const pipelineRuns = await prisma.pipelineRun.findMany({
      where: { ownerId: owner, currentStage: "TOPIC_GENERATION" },
    });
    expect(pipelineRuns.some((r) => r.status === "COMPLETED")).toBe(true);
  });

  it("fails explicitly and creates no Topic rows when the model returns malformed JSON twice", async () => {
    vi.mocked(getModel).mockReturnValue(sequencedMockModel(["not valid json {", "still not valid {"]));

    const beforeCount = await prisma.topic.count({ where: { ownerId: owner } });
    const result = await generateTopicSuggestions();
    const afterCount = await prisma.topic.count({ where: { ownerId: owner } });

    expect(result.success).toBe(false);
    expect(afterCount).toBe(beforeCount);

    const pipelineRuns = await prisma.pipelineRun.findMany({
      where: { ownerId: owner, currentStage: "TOPIC_GENERATION", status: "FAILED" },
    });
    expect(pipelineRuns.length).toBeGreaterThan(0);
  });
});
