import { describe, expect, it } from "vitest";
import {
  createKnowledgeItemSchema,
  updateKnowledgeItemSchema,
  queryKnowledgeItemsSchema,
} from "@/features/knowledge/schema";

describe("createKnowledgeItemSchema", () => {
  it("accepts a full valid payload", () => {
    const result = createKnowledgeItemSchema.safeParse({
      category: "CASE_STUDY",
      title: "Migrated client X to Postgres",
      body: "We migrated the client's stack...",
      tags: ["postgres", "migration"],
      pillarHints: ["TECHNICAL_INSIGHT", "CASE_STUDY"],
      sourceUrl: "https://example.com/doc",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a minimal valid payload and defaults tags/pillarHints to []", () => {
    const result = createKnowledgeItemSchema.safeParse({
      category: "FAQ",
      title: "What is our pricing model?",
      body: "We charge...",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual([]);
      expect(result.data.pillarHints).toEqual([]);
    }
  });

  it("rejects a missing title", () => {
    const result = createKnowledgeItemSchema.safeParse({
      category: "FAQ",
      body: "We charge...",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty title", () => {
    const result = createKnowledgeItemSchema.safeParse({
      category: "FAQ",
      title: "",
      body: "We charge...",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing body", () => {
    const result = createKnowledgeItemSchema.safeParse({
      category: "FAQ",
      title: "What is our pricing model?",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid category enum value", () => {
    const result = createKnowledgeItemSchema.safeParse({
      category: "NOT_A_CATEGORY",
      title: "Title",
      body: "Body",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid pillarHints enum value", () => {
    const result = createKnowledgeItemSchema.safeParse({
      category: "FAQ",
      title: "Title",
      body: "Body",
      pillarHints: ["NOT_A_PILLAR"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed sourceUrl", () => {
    const result = createKnowledgeItemSchema.safeParse({
      category: "FAQ",
      title: "Title",
      body: "Body",
      sourceUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateKnowledgeItemSchema", () => {
  it("accepts a partial payload with just id and one field", () => {
    const result = updateKnowledgeItemSchema.safeParse({
      id: "123e4567-e89b-12d3-a456-426614174000",
      title: "New title",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid id", () => {
    const result = updateKnowledgeItemSchema.safeParse({
      id: "not-a-uuid",
      title: "New title",
    });
    expect(result.success).toBe(false);
  });

  it("accepts archived as a plain boolean field update", () => {
    const result = updateKnowledgeItemSchema.safeParse({
      id: "123e4567-e89b-12d3-a456-426614174000",
      archived: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.archived).toBe(true);
    }
  });
});

describe("queryKnowledgeItemsSchema", () => {
  it("applies defaults on empty input", () => {
    const result = queryKnowledgeItemsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.archived).toBe(false);
      expect(result.data.limit).toBe(20);
    }
  });

  it("rejects a limit above 100", () => {
    const result = queryKnowledgeItemsSchema.safeParse({ limit: 101 });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid cursor", () => {
    const result = queryKnowledgeItemsSchema.safeParse({ cursor: "not-a-uuid" });
    expect(result.success).toBe(false);
  });
});
