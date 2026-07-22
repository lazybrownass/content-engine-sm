import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { MockLanguageModelV2 } from "ai/test";

vi.mock("@/lib/ai/model-router", () => ({ getModel: vi.fn() }));

import { getModel } from "@/lib/ai/model-router";
import { runPipeline } from "@/features/pipeline/orchestrator";

// Per ai/AGENTS.md §9.3, never assert on real model output in CI — every model
// call in this file is mocked.

const prisma = new PrismaClient();
const owner = randomUUID();

beforeAll(async () => {
  await prisma.user.create({ data: { id: owner, email: `pipeline-owner-${owner}@example.com` } });
});

afterAll(async () => {
  await prisma.pipelineRun.deleteMany({ where: { ownerId: owner } });
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

describe("runPipeline", () => {
  it("completes on the first try when the Grill score passes", async () => {
    mockGetModel({
      outline: sequencedMockModel([JSON.stringify({ sections: ["Hook", "Body", "CTA"] })]),
      draft: sequencedMockModel([JSON.stringify({ content: "Draft content." })]),
      grillReview: sequencedMockModel([JSON.stringify({ qualityScore: 92, violations: [] })]),
    });

    const run = await runPipeline({ ownerId: owner, topic: "Ship in public", brandVoice: null });

    expect(run.status).toBe("COMPLETED");
    expect(run.grillCycles).toBe(0);
    expect(run.qualityScore).toBe(92);

    const aiRuns = await prisma.aiRun.findMany({ where: { pipelineRunId: run.id } });
    expect(aiRuns).toHaveLength(3);
    expect(aiRuns.every((r) => r.status === "SUCCESS")).toBe(true);
  });

  it("triggers exactly one bounded revision when the Grill score fails then passes", async () => {
    mockGetModel({
      outline: sequencedMockModel([JSON.stringify({ sections: ["Hook", "Body", "CTA"] })]),
      draft: sequencedMockModel([
        JSON.stringify({ content: "First draft." }),
        JSON.stringify({ content: "Revised draft." }),
      ]),
      grillReview: sequencedMockModel([
        JSON.stringify({ qualityScore: 60, violations: ["Uses a forbidden word"] }),
        JSON.stringify({ qualityScore: 90, violations: [] }),
      ]),
    });

    const run = await runPipeline({ ownerId: owner, topic: "Ship in public", brandVoice: null });

    expect(run.status).toBe("COMPLETED");
    expect(run.grillCycles).toBe(1);
    expect(run.qualityScore).toBe(90);

    const aiRuns = await prisma.aiRun.findMany({ where: { pipelineRunId: run.id } });
    expect(aiRuns).toHaveLength(5);
  });

  it("still terminates as COMPLETED when the Grill score fails twice", async () => {
    mockGetModel({
      outline: sequencedMockModel([JSON.stringify({ sections: ["Hook", "Body", "CTA"] })]),
      draft: sequencedMockModel([
        JSON.stringify({ content: "First draft." }),
        JSON.stringify({ content: "Still not great." }),
      ]),
      grillReview: sequencedMockModel([
        JSON.stringify({ qualityScore: 40, violations: ["Too salesy"] }),
        JSON.stringify({ qualityScore: 50, violations: ["Still too salesy"] }),
      ]),
    });

    const run = await runPipeline({ ownerId: owner, topic: "Ship in public", brandVoice: null });

    expect(run.status).toBe("COMPLETED");
    expect(run.grillCycles).toBe(1);
    expect(run.qualityScore).toBe(50);

    const aiRuns = await prisma.aiRun.findMany({ where: { pipelineRunId: run.id } });
    expect(aiRuns).toHaveLength(5);
  });

  it("fails explicitly when the outline stage returns malformed JSON twice", async () => {
    const outline = sequencedMockModel(["not valid json {", "still not valid {"]);

    mockGetModel({
      outline,
      draft: sequencedMockModel([JSON.stringify({ content: "Unused" })]),
      grillReview: sequencedMockModel([JSON.stringify({ qualityScore: 90, violations: [] })]),
    });

    const run = await runPipeline({ ownerId: owner, topic: "Ship in public", brandVoice: null });

    expect(run.status).toBe("FAILED");
    expect(run.lastError).toBeTruthy();

    const aiRuns = await prisma.aiRun.findMany({ where: { pipelineRunId: run.id } });
    expect(aiRuns).toHaveLength(1);
    expect(aiRuns[0]?.status).toBe("FAILED");
    expect(aiRuns[0]?.stage).toBe("OUTLINE");
  });

  it("recovers via the schema-validation retry when the outline stage returns malformed JSON once", async () => {
    mockGetModel({
      outline: sequencedMockModel(["not valid json {", JSON.stringify({ sections: ["Hook", "Body"] })]),
      draft: sequencedMockModel([JSON.stringify({ content: "Draft content." })]),
      grillReview: sequencedMockModel([JSON.stringify({ qualityScore: 92, violations: [] })]),
    });

    const run = await runPipeline({ ownerId: owner, topic: "Ship in public", brandVoice: null });

    expect(run.status).toBe("COMPLETED");
    expect(run.retryCount).toBe(1);

    const outlineRuns = await prisma.aiRun.findMany({
      where: { pipelineRunId: run.id, stage: "OUTLINE" },
      orderBy: { createdAt: "asc" },
    });
    expect(outlineRuns).toHaveLength(2);
    expect(outlineRuns[0]?.status).toBe("FAILED");
    expect(outlineRuns[1]?.status).toBe("SUCCESS");
  });
});
