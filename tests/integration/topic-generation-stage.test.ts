import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient, type Pillar } from "@prisma/client";
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
import { MIN_SAMPLE_POSTS } from "@/features/analytics/style-memory";

// Per ai/AGENTS.md §9.3, never assert on real model output in CI — every model
// call in this file is mocked. Per §9.2, every pipeline stage's malformed-JSON
// retry-then-fail path gets a test.

const prisma = new PrismaClient();
const owner = randomUUID();
const ownerPillar = randomUUID(); // pillar-performance boosting tests, isolated so the sample gate is deterministic

beforeAll(async () => {
  await prisma.user.createMany({
    data: [
      { id: owner, email: `topic-gen-${owner}@example.com` },
      { id: ownerPillar, email: `topic-gen-pillar-${ownerPillar}@example.com` },
    ],
  });
});

afterAll(async () => {
  await prisma.topic.deleteMany({ where: { ownerId: { in: [owner, ownerPillar] } } });
  await prisma.pipelineRun.deleteMany({ where: { ownerId: { in: [owner, ownerPillar] } } });
  await prisma.knowledgeItem.deleteMany({ where: { ownerId: { in: [owner, ownerPillar] } } });
  await prisma.post.deleteMany({ where: { ownerId: { in: [owner, ownerPillar] } } }); // cascades AnalyticsSnapshot
  await prisma.user.deleteMany({ where: { id: { in: [owner, ownerPillar] } } });
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
  beforeEach(() => {
    vi.mocked(requireOwner).mockResolvedValue(owner);
  });

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

// Seeds a single PUBLISHED post + AnalyticsSnapshot at a specific pillar/engagement
// rate, for building deterministic per-pillar performance data.
async function seedScoredPost(ownerId: string, pillar: Pillar, engagementRate: number) {
  const post = await prisma.post.create({
    data: { ownerId, pillar, status: "PUBLISHED", finalText: "Some published post content." },
  });
  await prisma.analyticsSnapshot.create({
    data: { postId: post.id, source: "manual", engagementRate },
  });
}

describe("generateTopicSuggestions with pillar-performance boosting", () => {
  beforeEach(() => {
    vi.mocked(requireOwner).mockResolvedValue(ownerPillar);
  });

  it("boosts and persists topic scores based on historical pillar performance", async () => {
    const half = MIN_SAMPLE_POSTS / 2;
    for (let i = 0; i < half; i++) {
      await seedScoredPost(ownerPillar, "CASE_STUDY", 0.5); // high-performing pillar
      await seedScoredPost(ownerPillar, "EDUCATIONAL", 0.05); // low-performing pillar
    }

    vi.mocked(getModel).mockReturnValue(
      sequencedMockModel([
        JSON.stringify({
          suggestions: [
            {
              title: "High-performing pillar topic",
              rationale: "Grounded in the knowledge base.",
              pillar: "CASE_STUDY",
              sourceKnowledgeIds: [],
              score: 0.5,
            },
            {
              title: "Low-performing pillar topic",
              rationale: "Grounded in the knowledge base.",
              pillar: "EDUCATIONAL",
              sourceKnowledgeIds: [],
              score: 0.5,
            },
          ],
        }),
      ]),
    );

    const result = await generateTopicSuggestions();

    expect(result.success).toBe(true);
    if (!result.success) return;

    const highPillarTopic = result.data.find((t) => t.title === "High-performing pillar topic");
    const lowPillarTopic = result.data.find((t) => t.title === "Low-performing pillar topic");

    expect(highPillarTopic?.score).toBeGreaterThan(0.5);
    expect(lowPillarTopic?.score).toBeLessThan(0.5);
    expect(highPillarTopic?.score).toBeLessThanOrEqual(1);
    expect(lowPillarTopic?.score).toBeGreaterThanOrEqual(0);
  });

  it("leaves topic scores unchanged below the sample threshold", async () => {
    // A fresh owner-scoped run with no seeded pillar-performance data: only the
    // topics/pipelineRuns from the prior test in this describe block exist, and
    // none of them carry PUBLISHED posts with analytics, so the gate stays shut.
    const freshOwner = randomUUID();
    await prisma.user.create({ data: { id: freshOwner, email: `topic-gen-fresh-${freshOwner}@example.com` } });
    vi.mocked(requireOwner).mockResolvedValue(freshOwner);

    vi.mocked(getModel).mockReturnValue(
      sequencedMockModel([
        JSON.stringify({
          suggestions: [
            {
              title: "Unboosted topic",
              rationale: "Grounded in the knowledge base.",
              pillar: "CASE_STUDY",
              sourceKnowledgeIds: [],
              score: 0.5,
            },
          ],
        }),
      ]),
    );

    const result = await generateTopicSuggestions();

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[0]?.score).toBe(0.5);

    await prisma.topic.deleteMany({ where: { ownerId: freshOwner } });
    await prisma.pipelineRun.deleteMany({ where: { ownerId: freshOwner } });
    await prisma.user.deleteMany({ where: { id: freshOwner } });
  });
});
