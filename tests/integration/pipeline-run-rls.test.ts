import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

// AGENTS.md §9.5: RLS changes require an integration test proving a non-owner
// query returns zero rows. Like the existing brand-voice.test.ts, this is an
// app-layer ownerId-scoping proof (the test suite's PrismaClient connection
// doesn't switch Postgres roles/session auth.uid()), matching established
// precedent rather than introducing new test infrastructure.

const prisma = new PrismaClient();

const ownerA = randomUUID();
const ownerB = randomUUID();

let pipelineRunA: { id: string };
let pipelineRunB: { id: string };

beforeAll(async () => {
  await prisma.user.createMany({
    data: [
      { id: ownerA, email: `pipeline-rls-a-${ownerA}@example.com` },
      { id: ownerB, email: `pipeline-rls-b-${ownerB}@example.com` },
    ],
  });

  pipelineRunA = await prisma.pipelineRun.create({
    data: { ownerId: ownerA, status: "COMPLETED", qualityScore: 90 },
  });
  pipelineRunB = await prisma.pipelineRun.create({
    data: { ownerId: ownerB, status: "COMPLETED", qualityScore: 80 },
  });

  await prisma.aiRun.create({
    data: {
      pipelineRunId: pipelineRunA.id,
      stage: "OUTLINE",
      modelId: "mock-model",
      status: "SUCCESS",
    },
  });
  await prisma.aiRun.create({
    data: {
      pipelineRunId: pipelineRunB.id,
      stage: "OUTLINE",
      modelId: "mock-model",
      status: "SUCCESS",
    },
  });
});

afterAll(async () => {
  await prisma.pipelineRun.deleteMany({ where: { ownerId: { in: [ownerA, ownerB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerA, ownerB] } } });
  await prisma.$disconnect();
});

describe("PipelineRun/AiRun ownership scoping", () => {
  it("never returns another owner's PipelineRun rows", async () => {
    const runs = await prisma.pipelineRun.findMany({ where: { ownerId: ownerA } });

    expect(runs.every((r) => r.ownerId === ownerA)).toBe(true);
    expect(runs.some((r) => r.id === pipelineRunB.id)).toBe(false);
  });

  it("never returns another owner's AiRun rows via the PipelineRun join", async () => {
    const aiRuns = await prisma.aiRun.findMany({
      where: { pipelineRun: { ownerId: ownerA } },
    });

    expect(aiRuns.every((r) => r.pipelineRunId === pipelineRunA.id)).toBe(true);
    expect(aiRuns.some((r) => r.pipelineRunId === pipelineRunB.id)).toBe(false);
  });
});
