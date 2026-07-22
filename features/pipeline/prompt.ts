import type { BrandVoice } from "@prisma/client";

import { buildBrandVoiceBlock, buildContextBlock } from "@/features/generation/prompt";
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
}

export function buildDraftPrompt({
  topic,
  outline,
  brandVoice,
  knowledgeChunks,
  revisionFeedback,
}: BuildDraftPromptInput): BuildPromptOutput {
  const system = [
    "You are an expert content writer producing full post content for a single author, following the given outline.",
    "Return ONLY a JSON object with key content (the full drafted post text). No markdown fences, no commentary, no extra keys.",
    buildBrandVoiceBlock(brandVoice),
    "Do not state any statistic, client name, or outcome not present in the CONTEXT below.",
  ].join("\n\n");

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
