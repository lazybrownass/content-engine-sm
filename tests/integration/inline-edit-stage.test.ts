import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { MockLanguageModelV2 } from "ai/test";

vi.mock("@/lib/ai/model-router", () => ({ getModel: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({
  requireOwner: vi.fn(),
  AuthError: class AuthError extends Error {},
}));

import { getModel } from "@/lib/ai/model-router";
import { requireOwner } from "@/lib/auth/require-owner";
import { applyInlineEdit } from "@/features/posts/actions";

// Per ai/AGENTS.md §9.3, never assert on real model output in CI — every model
// call in this file is mocked. Per §9.2, every pipeline stage's malformed-JSON
// retry-then-fail path gets a test.

const prisma = new PrismaClient();
const owner = randomUUID();
let postId: string;

beforeAll(async () => {
  await prisma.user.create({ data: { id: owner, email: `inline-edit-${owner}@example.com` } });
  const post = await prisma.post.create({ data: { ownerId: owner, pillar: "CASE_STUDY" } });
  postId = post.id;
  vi.mocked(requireOwner).mockResolvedValue(owner);
});

afterAll(async () => {
  await prisma.pipelineRun.deleteMany({ where: { ownerId: owner } });
  await prisma.post.deleteMany({ where: { ownerId: owner } });
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

describe("applyInlineEdit", () => {
  it.each([
    ["rewrite", "INLINE_REWRITE"],
    ["shorten", "INLINE_SHORTEN"],
    ["change_hook", "INLINE_CHANGE_HOOK"],
  ] as const)("records the %s action under the %s stage and returns the result", async (action, stage) => {
    vi.mocked(getModel).mockReturnValue(
      sequencedMockModel([JSON.stringify({ result: `${action} output` })]),
    );

    const result = await applyInlineEdit({
      postId,
      action,
      selectedText: "Some selected text.",
      contextText: "Full post.\nSome selected text.\nEnding.",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.result).toBe(`${action} output`);

    const pipelineRuns = await prisma.pipelineRun.findMany({
      where: { ownerId: owner, postId, currentStage: stage },
    });
    expect(pipelineRuns.some((r) => r.status === "COMPLETED")).toBe(true);
  });

  it("fails explicitly and does not write Post.finalText when the model returns malformed JSON twice", async () => {
    vi.mocked(getModel).mockReturnValue(sequencedMockModel(["not valid json {", "still not valid {"]));

    const before = await prisma.post.findUniqueOrThrow({ where: { id: postId } });

    const result = await applyInlineEdit({
      postId,
      action: "rewrite",
      selectedText: "Some text.",
      contextText: "Some text.",
    });

    expect(result.success).toBe(false);

    const after = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
    expect(after.finalText).toBe(before.finalText);

    const pipelineRuns = await prisma.pipelineRun.findMany({
      where: { ownerId: owner, postId, currentStage: "INLINE_REWRITE", status: "FAILED" },
    });
    expect(pipelineRuns.length).toBeGreaterThan(0);
  });

  it("returns NOT_FOUND for another owner's post", async () => {
    const otherOwner = randomUUID();
    await prisma.user.create({ data: { id: otherOwner, email: `other-${otherOwner}@example.com` } });
    vi.mocked(requireOwner).mockResolvedValueOnce(otherOwner);

    const result = await applyInlineEdit({
      postId,
      action: "rewrite",
      selectedText: "Text.",
      contextText: "Text.",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("NOT_FOUND");

    await prisma.user.delete({ where: { id: otherOwner } });
  });
});
