import type { BrandVoice } from "@prisma/client";

import {
  buildBrandVoiceBlock,
  buildContextBlock,
  buildPillarPerformanceBlock,
  buildStyleMemoryBlock,
  type PillarPerformanceForPrompt,
  type StyleMemoryForPrompt,
} from "@/features/generation/prompt";
import type { KnowledgeSearchItemResult } from "@/features/knowledge/queries";

export interface BuildOutlinePromptInput {
  topic: string;
  brandVoice: BrandVoice | null;
  knowledgeChunks: KnowledgeSearchItemResult[];
}

export interface BuildPromptOutput {
  system: string;
  prompt: string;
}

export function buildOutlinePrompt({
  topic,
  brandVoice,
  knowledgeChunks,
}: BuildOutlinePromptInput): BuildPromptOutput {
  const system = [
    "You are an expert content strategist producing a post outline for a single author.",
    "Return ONLY a JSON object with key sections (an array of short outline beats, 2-8 items). No markdown fences, no commentary, no extra keys.",
    buildBrandVoiceBlock(brandVoice),
    "Do not state any statistic, client name, or outcome not present in the CONTEXT below.",
  ].join("\n\n");

  const prompt = [
    `CONTEXT:\n${buildContextBlock(knowledgeChunks)}`,
    `TOPIC:\n${topic}`,
  ].join("\n\n");

  return { system, prompt };
}

export interface BuildDraftPromptInput {
  topic: string;
  outline: string[];
  brandVoice: BrandVoice | null;
  knowledgeChunks: KnowledgeSearchItemResult[];
  revisionFeedback?: string[];
  styleMemory?: StyleMemoryForPrompt | null;
}

export function buildDraftPrompt({
  topic,
  outline,
  brandVoice,
  knowledgeChunks,
  revisionFeedback,
  styleMemory,
}: BuildDraftPromptInput): BuildPromptOutput {
  const system = [
    "You are an expert content writer producing full post content for a single author, following the given outline.",
    "Return ONLY a JSON object with key content (the full drafted post text). No markdown fences, no commentary, no extra keys.",
    buildBrandVoiceBlock(brandVoice),
    buildStyleMemoryBlock(styleMemory),
    "Do not state any statistic, client name, or outcome not present in the CONTEXT below.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const promptParts = [
    `CONTEXT:\n${buildContextBlock(knowledgeChunks)}`,
    `TOPIC:\n${topic}`,
    `OUTLINE:\n${outline.map((section) => `- ${section}`).join("\n")}`,
  ];

  if (revisionFeedback && revisionFeedback.length > 0) {
    promptParts.push(
      `This is a revision. Address the following issues from the previous review:\n${revisionFeedback
        .map((issue) => `- ${issue}`)
        .join("\n")}`,
    );
  }

  return { system, prompt: promptParts.join("\n\n") };
}

export interface BuildGrillPromptInput {
  draft: string;
  brandVoice: BrandVoice | null;
  knowledgeChunks: KnowledgeSearchItemResult[];
}

export function buildGrillPrompt({
  draft,
  brandVoice,
  knowledgeChunks,
}: BuildGrillPromptInput): BuildPromptOutput {
  const system = [
    "You are a strict editor scoring drafted post content before publication.",
    "Return ONLY a JSON object with keys qualityScore (integer 0-100) and violations (an array of specific issue strings). No markdown fences, no commentary, no extra keys.",
    "Score how well the DRAFT matches this brand voice; list any forbidden words used as violations.",
    buildBrandVoiceBlock(brandVoice),
    "Check the DRAFT below only for claims (statistics, client names, outcomes) not grounded in the CONTEXT. List any such fabricated claims as violations.",
  ].join("\n\n");

  const prompt = [`CONTEXT:\n${buildContextBlock(knowledgeChunks)}`, `DRAFT:\n${draft}`].join(
    "\n\n",
  );

  return { system, prompt };
}

export interface BuildTopicGenerationPromptInput {
  knowledgeStatsSummary: string;
  existingTitles: string[];
  knowledgeChunks: KnowledgeSearchItemResult[];
  pillarPerformance?: PillarPerformanceForPrompt[] | null;
  hookPatterns?: { pattern: string; frequency: number }[];
}

export function buildTopicGenerationPrompt({
  knowledgeStatsSummary,
  existingTitles,
  knowledgeChunks,
  pillarPerformance,
  hookPatterns,
}: BuildTopicGenerationPromptInput): BuildPromptOutput {
  const system = [
    "You are a content strategist suggesting LinkedIn post topics for a single author, grounded strictly in their knowledge base.",
    "Return ONLY a JSON object with key suggestions (an array of 5-10 objects), each with keys title, rationale, pillar, sourceKnowledgeIds (array of the CONTEXT item ids the suggestion draws on), and score (0-1, your confidence this is a strong topic). No markdown fences, no commentary, no extra keys.",
    "Favor topics that cover categories/pillars underrepresented in KNOWLEDGE COVERAGE below, and that are not near-duplicates of EXISTING TOPICS.",
    buildPillarPerformanceBlock(pillarPerformance, hookPatterns),
    "Every sourceKnowledgeIds entry must be an id that literally appears in the CONTEXT below — never invent one.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const prompt = [
    `KNOWLEDGE COVERAGE:\n${knowledgeStatsSummary}`,
    `EXISTING TOPICS (avoid duplicating):\n${
      existingTitles.length > 0 ? existingTitles.map((title) => `- ${title}`).join("\n") : "(none yet)"
    }`,
    `CONTEXT:\n${knowledgeChunks
      .map(({ item, matchedContent }) => `### ${item.id} — ${item.title}\n${matchedContent}`)
      .join("\n\n")}`,
  ].join("\n\n");

  return { system, prompt };
}

export type InlineEditAction = "rewrite" | "shorten" | "change_hook";

export interface BuildInlineEditPromptInput {
  action: InlineEditAction;
  selectedText: string;
  contextText: string;
  brandVoice: BrandVoice | null;
}

const INLINE_EDIT_INSTRUCTIONS: Record<InlineEditAction, string> = {
  rewrite: "Rewrite the SELECTED text to read better, keeping its meaning and length roughly the same.",
  shorten: "Shorten the SELECTED text to its most essential point, cutting at least a third of its length.",
  change_hook:
    "Rewrite the SELECTED text (the post's opening line) into a stronger, more attention-grabbing hook.",
};

export function buildInlineEditPrompt({
  action,
  selectedText,
  contextText,
  brandVoice,
}: BuildInlineEditPromptInput): BuildPromptOutput {
  const system = [
    "You are an editor making one focused change to a single sentence or passage within a larger LinkedIn post.",
    INLINE_EDIT_INSTRUCTIONS[action],
    "Return ONLY a JSON object with key result (the replacement text for SELECTED only — not the full post). No markdown fences, no commentary, no extra keys.",
    buildBrandVoiceBlock(brandVoice),
  ].join("\n\n");

  const prompt = [`FULL POST (for context/voice only):\n${contextText}`, `SELECTED:\n${selectedText}`].join(
    "\n\n",
  );

  return { system, prompt };
}
