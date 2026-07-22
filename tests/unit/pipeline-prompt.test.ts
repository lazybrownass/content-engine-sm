import type { BrandVoice, KnowledgeItem } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  buildDraftPrompt,
  buildGrillPrompt,
  buildInlineEditPrompt,
  buildOutlinePrompt,
  buildTopicGenerationPrompt,
} from "@/features/pipeline/prompt";
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

function makeKnowledgeChunk(
  overrides: Partial<KnowledgeItem> = {},
  matchedContent = "Chunk content",
): KnowledgeSearchItemResult {
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

describe("buildOutlinePrompt", () => {
  it("includes tone, forbidden words, and the topic", () => {
    const { system, prompt } = buildOutlinePrompt({
      topic: "Why founders should ship in public",
      brandVoice: makeBrandVoice(),
      knowledgeChunks: [],
    });

    expect(system).toContain("direct, optimistic");
    expect(system).toContain("synergy, leverage");
    expect(prompt).toContain("Why founders should ship in public");
  });

  it("emits an explicit no-matches line when knowledgeChunks is empty", () => {
    const { prompt } = buildOutlinePrompt({
      topic: "Topic",
      brandVoice: null,
      knowledgeChunks: [],
    });

    expect(prompt).toContain("No knowledge base matches were found");
  });
});

describe("buildDraftPrompt", () => {
  it("embeds the outline sections and knowledge chunk content", () => {
    const { prompt } = buildDraftPrompt({
      topic: "Topic",
      outline: ["Hook", "Body", "CTA"],
      brandVoice: null,
      knowledgeChunks: [makeKnowledgeChunk({ title: "Client migration case study" }, "We cut latency by 40%")],
    });

    expect(prompt).toContain("Hook");
    expect(prompt).toContain("Client migration case study");
    expect(prompt).toContain("We cut latency by 40%");
  });

  it("appends revision feedback when provided", () => {
    const { prompt } = buildDraftPrompt({
      topic: "Topic",
      outline: ["Hook"],
      brandVoice: null,
      knowledgeChunks: [],
      revisionFeedback: ["Used a forbidden word: synergy"],
    });

    expect(prompt).toContain("This is a revision");
    expect(prompt).toContain("Used a forbidden word: synergy");
  });

  it("omits the revision block when no feedback is provided", () => {
    const { prompt } = buildDraftPrompt({
      topic: "Topic",
      outline: ["Hook"],
      brandVoice: null,
      knowledgeChunks: [],
    });

    expect(prompt).not.toContain("This is a revision");
  });
});

describe("buildGrillPrompt", () => {
  it("includes brand voice scoring criteria and an anti-fabrication check", () => {
    const { system } = buildGrillPrompt({
      draft: "Some drafted content.",
      brandVoice: makeBrandVoice(),
      knowledgeChunks: [],
    });

    expect(system).toContain("synergy, leverage");
    expect(system).toContain("fabricated claims");
  });

  it("includes the draft content in the prompt", () => {
    const { prompt } = buildGrillPrompt({
      draft: "Some drafted content.",
      brandVoice: null,
      knowledgeChunks: [],
    });

    expect(prompt).toContain("Some drafted content.");
  });
});

describe("buildTopicGenerationPrompt", () => {
  it("includes knowledge coverage summary, existing titles, and CONTEXT item ids", () => {
    const { system, prompt } = buildTopicGenerationPrompt({
      knowledgeStatsSummary: "CASE_STUDY: 3, FOUNDER_STORY: 0",
      existingTitles: ["Why we ship in public"],
      knowledgeChunks: [
        makeKnowledgeChunk({ id: "item-42", title: "Client migration case study" }, "We cut latency by 40%"),
      ],
    });

    expect(prompt).toContain("CASE_STUDY: 3, FOUNDER_STORY: 0");
    expect(prompt).toContain("Why we ship in public");
    expect(prompt).toContain("item-42");
    expect(prompt).toContain("We cut latency by 40%");
    expect(system).toContain("underrepresented");
  });

  it("shows a placeholder when there are no existing topics yet", () => {
    const { prompt } = buildTopicGenerationPrompt({
      knowledgeStatsSummary: "No knowledge yet.",
      existingTitles: [],
      knowledgeChunks: [],
    });

    expect(prompt).toContain("(none yet)");
  });
});

describe("buildInlineEditPrompt", () => {
  it("includes the selection, full-post context, and a rewrite instruction for the rewrite action", () => {
    const { system, prompt } = buildInlineEditPrompt({
      action: "rewrite",
      selectedText: "This part is clunky.",
      contextText: "Full post.\nThis part is clunky.\nEnding.",
      brandVoice: null,
    });

    expect(system).toContain("Rewrite the SELECTED text");
    expect(prompt).toContain("This part is clunky.");
    expect(prompt).toContain("Full post.\nThis part is clunky.\nEnding.");
  });

  it("uses a shortening instruction for the shorten action", () => {
    const { system } = buildInlineEditPrompt({
      action: "shorten",
      selectedText: "Some long text.",
      contextText: "Some long text.",
      brandVoice: null,
    });

    expect(system).toContain("Shorten the SELECTED text");
  });

  it("uses a hook-rewriting instruction for the change_hook action", () => {
    const { system } = buildInlineEditPrompt({
      action: "change_hook",
      selectedText: "Old opening line.",
      contextText: "Old opening line.\nRest of the post.",
      brandVoice: null,
    });

    expect(system).toContain("stronger, more attention-grabbing hook");
  });

  it("includes brand voice guidance when provided", () => {
    const { system } = buildInlineEditPrompt({
      action: "rewrite",
      selectedText: "Text.",
      contextText: "Text.",
      brandVoice: makeBrandVoice(),
    });

    expect(system).toContain("synergy, leverage");
  });
});
