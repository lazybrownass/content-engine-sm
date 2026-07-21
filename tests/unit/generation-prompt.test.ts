import type { BrandVoice, KnowledgeItem } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildGenerationPrompt } from "@/features/generation/prompt";
import type { KnowledgeSearchItemResult } from "@/features/knowledge/queries";

function makeBrandVoice(overrides: Partial<BrandVoice> = {}): BrandVoice {
  return {
    id: "voice-1",
    ownerId: "owner-1",
    name: "Confident Founder",
    tone: ["direct", "optimistic"],
    targetAudience: "Early-stage SaaS founders",
    forbiddenWords: ["synergy", "leverage"],
    signatureHooks: ["Here's what nobody tells you about..."],
    formattingRules: ["short paragraphs"],
    isDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeKnowledgeChunk(overrides: Partial<KnowledgeItem> = {}, matchedContent = "Chunk content"): KnowledgeSearchItemResult {
  const item: KnowledgeItem = {
    id: "item-1",
    ownerId: "owner-1",
    category: "CASE_STUDY",
    title: "Client migration case study",
    body: "Full body",
    tags: [],
    pillarHints: [],
    sourceUrl: null,
    archived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  return { item, matchedContent, score: 0.9 };
}

describe("buildGenerationPrompt", () => {
  it("includes tone, forbidden words, and signature hooks in the system prompt", () => {
    const { system } = buildGenerationPrompt({
      userPrompt: "Write about our Q3 launch",
      knowledgeChunks: [],
      brandVoice: makeBrandVoice(),
    });

    expect(system).toContain("direct, optimistic");
    expect(system).toContain("synergy, leverage");
    expect(system).toContain("Here's what nobody tells you about...");
  });

  it("embeds knowledge chunk content and titles in the user prompt", () => {
    const { prompt } = buildGenerationPrompt({
      userPrompt: "Write about our Q3 launch",
      knowledgeChunks: [makeKnowledgeChunk({ title: "Client migration case study" }, "We cut latency by 40%")],
      brandVoice: null,
    });

    expect(prompt).toContain("Client migration case study");
    expect(prompt).toContain("We cut latency by 40%");
    expect(prompt).toContain("Write about our Q3 launch");
  });

  it("emits an explicit no-matches line when knowledgeChunks is empty", () => {
    const { prompt } = buildGenerationPrompt({
      userPrompt: "Write about our Q3 launch",
      knowledgeChunks: [],
      brandVoice: null,
    });

    expect(prompt).toContain("No knowledge base matches were found");
  });

  it("falls back to a generic tone note when no brand voice is selected", () => {
    const { system } = buildGenerationPrompt({
      userPrompt: "Write about our Q3 launch",
      knowledgeChunks: [],
      brandVoice: null,
    });

    expect(system).toContain("No brand voice was selected");
  });
});
