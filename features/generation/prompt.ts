import type { BrandVoice } from "@prisma/client";

import type { KnowledgeSearchItemResult } from "@/features/knowledge/queries";

export interface BuildGenerationPromptInput {
  userPrompt: string;
  knowledgeChunks: KnowledgeSearchItemResult[];
  brandVoice: BrandVoice | null;
}

export interface BuildGenerationPromptOutput {
  system: string;
  prompt: string;
}

export function buildBrandVoiceBlock(brandVoice: BrandVoice | null): string {
  if (!brandVoice) {
    return "No brand voice was selected — write in a clear, professional, generic tone.";
  }

  const lines = [`Brand voice: "${brandVoice.name}".`];
  if (brandVoice.tone.length > 0) {
    lines.push(`Tone: ${brandVoice.tone.join(", ")}.`);
  }
  if (brandVoice.targetAudience) {
    lines.push(`Target audience: ${brandVoice.targetAudience}.`);
  }
  if (brandVoice.forbiddenWords.length > 0) {
    lines.push(`Never use these words or phrases: ${brandVoice.forbiddenWords.join(", ")}.`);
  }
  if (brandVoice.signatureHooks.length > 0) {
    lines.push(`Draw inspiration from these signature hooks when relevant: ${brandVoice.signatureHooks.join(", ")}.`);
  }
  if (brandVoice.formattingRules.length > 0) {
    lines.push(`Formatting rules: ${brandVoice.formattingRules.join(", ")}.`);
  }
  return lines.join("\n");
}

export function buildContextBlock(knowledgeChunks: KnowledgeSearchItemResult[]): string {
  if (knowledgeChunks.length === 0) {
    return "No knowledge base matches were found; write from the request alone and do not invent specifics.";
  }

  return knowledgeChunks
    .map(({ item, matchedContent }) => `### ${item.title}\n${matchedContent}`)
    .join("\n\n");
}

export function buildGenerationPrompt({
  userPrompt,
  knowledgeChunks,
  brandVoice,
}: BuildGenerationPromptInput): BuildGenerationPromptOutput {
  const system = [
    "You are an expert social content writer producing LinkedIn and X content for a single author.",
    "Return ONLY a JSON object with keys hook, linkedInPost, tweetThread (an array of strings). No markdown fences, no commentary, no extra keys.",
    buildBrandVoiceBlock(brandVoice),
    "Do not state any statistic, client name, or outcome not present in the CONTEXT below.",
  ].join("\n\n");

  const prompt = [
    `CONTEXT:\n${buildContextBlock(knowledgeChunks)}`,
    `REQUEST:\n${userPrompt}`,
  ].join("\n\n");

  return { system, prompt };
}
