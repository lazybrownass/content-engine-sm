import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

// Verifies the FK ON DELETE CASCADE chain declared in prisma/schema.prisma actually behaves
// correctly end-to-end when a User row is removed — deleting an account has no dedicated
// UI/action (out of scope, see docs/06-Implementation-Plan.md's Phase 6 note; the PRD only
// requires data export/portability, not account erasure), so this proves the schema-level
// guarantee directly rather than leaving it unverified.
const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

describe("deleting a User cascades through every owned table", () => {
  it("removes KnowledgeItem/KnowledgeChunk, Post/PipelineRun/AiRun, and Settings", async () => {
    const ownerId = randomUUID();
    await prisma.user.create({ data: { id: ownerId, email: `cascade-${ownerId}@example.com` } });

    const settings = await prisma.settings.create({ data: { ownerId } });

    const knowledgeItem = await prisma.knowledgeItem.create({
      data: { ownerId, category: "FAQ", title: "cascade test item", body: "body" },
    });
    const chunk = await prisma.knowledgeChunk.create({
      data: { knowledgeItemId: knowledgeItem.id, ordinal: 0, content: "chunk content" },
    });

    const post = await prisma.post.create({ data: { ownerId, pillar: "CASE_STUDY" } });
    const pipelineRun = await prisma.pipelineRun.create({ data: { ownerId, postId: post.id } });
    const aiRun = await prisma.aiRun.create({
      data: { pipelineRunId: pipelineRun.id, stage: "DRAFT", modelId: "test-model", status: "SUCCESS" },
    });

    await prisma.user.delete({ where: { id: ownerId } });

    expect(await prisma.settings.findUnique({ where: { id: settings.id } })).toBeNull();
    expect(await prisma.knowledgeItem.findUnique({ where: { id: knowledgeItem.id } })).toBeNull();
    expect(await prisma.knowledgeChunk.findUnique({ where: { id: chunk.id } })).toBeNull();
    expect(await prisma.post.findUnique({ where: { id: post.id } })).toBeNull();
    expect(await prisma.pipelineRun.findUnique({ where: { id: pipelineRun.id } })).toBeNull();
    expect(await prisma.aiRun.findUnique({ where: { id: aiRun.id } })).toBeNull();
  });
});
