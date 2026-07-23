import type { BrandVoice } from "@prisma/client";

import type { KnowledgeSearchItemResult } from "@/features/knowledge/queries";

export interface BuildGenerationPromptInput {
  userPrompt: string;
  knowledgeChunks: KnowledgeSearchItemResult[];
  brandVoice: BrandVoice | null;
  styleMemory?: StyleMemoryForPrompt | null;
}

export interface BuildGenerationPromptOutput {
  system: string;
  prompt: string;
}

// The subset of the StyleMemoryProfile the prompt actually needs. Built from the
// owner's high-performing published posts (features/analytics) and injected so
// future output leans on what has historically engaged.
export interface StyleMemoryForPrompt {
  avgSentenceLength: number | null;
  emojiUsageRate: number | null;
  hookPatterns: { pattern: string; frequency: number }[];
  favoriteVocabulary: string[];
  avoidedPhrases: string[];
  exampleHooks: string[];
}

export function buildStyleMemoryBlock(styleMemory: StyleMemoryForPrompt | null | undefined): string {
  if (!styleMemory) return "";

  const { avgSentenceLength, emojiUsageRate, hookPatterns, favoriteVocabulary, avoidedPhrases, exampleHooks } =
    styleMemory;

  const lines: string[] = [];
  if (avgSentenceLength) {
    lines.push(`Aim for an average sentence length of about ${Math.round(avgSentenceLength)} words.`);
  }
  if (emojiUsageRate !== null) {
    lines.push(
      emojiUsageRate < 0.5
        ? "Use emoji sparingly, if at all — the author's best posts rarely use them."
        : `Match the author's emoji cadence (roughly ${emojiUsageRate.toFixed(1)} per 100 words).`,
    );
  }
  if (hookPatterns.length > 0) {
    lines.push(`Favor hook styles that have worked before: ${hookPatterns.map((h) => h.pattern).join(" | ")}.`);
  }
  if (exampleHooks.length > 0) {
    lines.push(
      `Winning opening lines to draw inspiration from:\n${exampleHooks.map((h) => `- ${h}`).join("\n")}`,
    );
  }
  if (favoriteVocabulary.length > 0) {
    lines.push(`Lean on the author's high-performing vocabulary where natural: ${favoriteVocabulary.join(", ")}.`);
  }
  if (avoidedPhrases.length > 0) {
    lines.push(`Avoid these over-used phrases: ${avoidedPhrases.join(", ")}.`);
  }

  if (lines.length === 0) return "";
  return ["Style memory (learned from the author's highest-performing posts):", ...lines].join("\n");
}

// One pillar's historical engagement, in the shape the prompt needs (a ranked
// array) rather than the Record<Pillar,...> shape features/analytics/queries.ts
// returns — callers convert once at the call site.
export interface PillarPerformanceForPrompt {
  pillar: string;
  avgEngagementRate: number;
  sampleCount: number;
}

export function buildPillarPerformanceBlock(
  pillarPerformance: PillarPerformanceForPrompt[] | null | undefined,
  hookPatterns?: { pattern: string; frequency: number }[],
): string {
  if (!pillarPerformance || pillarPerformance.length === 0) return "";

  const ranked = [...pillarPerformance].sort((a, b) => b.avgEngagementRate - a.avgEngagementRate);
  const lines = [
    `Historical engagement by content pillar (n = published posts with logged metrics): ${ranked
      .map((p) => `${p.pillar}=${p.avgEngagementRate.toFixed(3)} (n=${p.sampleCount})`)
      .join(", ")}.`,
    "Favor topics in pillars that have historically performed well; don't abandon underrepresented pillars entirely, but weight suggestions toward what has proven to work.",
  ];
  if (hookPatterns && hookPatterns.length > 0) {
    lines.push(`Hook styles that have driven engagement before: ${hookPatterns.map((h) => h.pattern).join(" | ")}.`);
  }
  return ["Historical performance signal (learned from published posts' engagement):", ...lines].join("\n");
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
  styleMemory,
}: BuildGenerationPromptInput): BuildGenerationPromptOutput {
  const system = [
    "You are an expert social content writer producing LinkedIn and X content for a single author.",
    "Return ONLY a JSON object with keys hook, linkedInPost, tweetThread (an array of strings). No markdown fences, no commentary, no extra keys.",
    buildBrandVoiceBlock(brandVoice),
    buildStyleMemoryBlock(styleMemory),
    "Do not state any statistic, client name, or outcome not present in the CONTEXT below.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const prompt = [
    `CONTEXT:\n${buildContextBlock(knowledgeChunks)}`,
    `REQUEST:\n${userPrompt}`,
  ].join("\n\n");

  return { system, prompt };
}
