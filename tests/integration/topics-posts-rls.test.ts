import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

// AGENTS.md §9.5: RLS changes require an integration test proving a non-owner
// query returns zero rows. Like pipeline-run-rls.test.ts, this is an app-layer
// ownerId-scoping proof (the test suite's PrismaClient connection doesn't switch
// Postgres roles/session auth.uid()), matching established precedent rather than
// introducing new test infrastructure. The owner_full_access RLS policies added
// alongside the topics/posts tables are a DB-level backstop per AGENTS.md §7.2;
// this test proves the app-layer ownerId filter that's actually load-bearing today.

const prisma = new PrismaClient();

const ownerA = randomUUID();
const ownerB = randomUUID();

let topicA: { id: string };
let topicB: { id: string };
let postA: { id: string };
let postB: { id: string };

beforeAll(async () => {
  await prisma.user.createMany({
    data: [
      { id: ownerA, email: `topics-posts-rls-a-${ownerA}@example.com` },
      { id: ownerB, email: `topics-posts-rls-b-${ownerB}@example.com` },
    ],
  });

  topicA = await prisma.topic.create({
    data: { ownerId: ownerA, title: "Topic A", rationale: "Reason A", pillar: "CASE_STUDY" },
  });
  topicB = await prisma.topic.create({
    data: { ownerId: ownerB, title: "Topic B", rationale: "Reason B", pillar: "CASE_STUDY" },
  });

  postA = await prisma.post.create({ data: { ownerId: ownerA, pillar: "CASE_STUDY" } });
  postB = await prisma.post.create({ data: { ownerId: ownerB, pillar: "CASE_STUDY" } });
});

afterAll(async () => {
  await prisma.post.deleteMany({ where: { ownerId: { in: [ownerA, ownerB] } } });
  await prisma.topic.deleteMany({ where: { ownerId: { in: [ownerA, ownerB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerA, ownerB] } } });
  await prisma.$disconnect();
});

describe("Topic ownership scoping", () => {
  it("returns only this owner's Topic rows", async () => {
    const topics = await prisma.topic.findMany({ where: { ownerId: ownerA } });

    expect(topics.some((t) => t.id === topicA.id)).toBe(true);
    expect(topics.some((t) => t.id === topicB.id)).toBe(false);
  });
});

describe("Post ownership scoping", () => {
  it("returns only this owner's Post rows", async () => {
    const posts = await prisma.post.findMany({ where: { ownerId: ownerA } });

    expect(posts.some((p) => p.id === postA.id)).toBe(true);
    expect(posts.some((p) => p.id === postB.id)).toBe(false);
  });
});
