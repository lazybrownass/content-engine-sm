import { PipelineStage } from "@prisma/client";

import { buildTopicGenerationPrompt } from "@/features/pipeline/prompt";
import { generateStageObject } from "@/features/pipeline/run-stage";
import { topicGenerationOutputSchema } from "@/features/pipeline/schema";
import type { KnowledgeSearchItemResult } from "@/features/knowledge/queries";
import type { PillarPerformanceForPrompt } from "@/features/generation/prompt";

export interface RunTopicGenerationStageInput {
  knowledgeStatsSummary: string;
  existingTitles: string[];
  knowledgeChunks: KnowledgeSearchItemResult[];
  pillarPerformance?: PillarPerformanceForPrompt[] | null;
  hookPatterns?: { pattern: string; frequency: number }[];
}

export async function runTopicGenerationStage({
  knowledgeStatsSummary,
  existingTitles,
  knowledgeChunks,
  pillarPerformance,
  hookPatterns,
}: RunTopicGenerationStageInput) {
  const { system, prompt } = buildTopicGenerationPrompt({
    knowledgeStatsSummary,
    existingTitles,
    knowledgeChunks,
    pillarPerformance,
    hookPatterns,
  });

  return generateStageObject({
    stage: PipelineStage.TOPIC_GENERATION,
    purpose: "topic_generation",
    schema: topicGenerationOutputSchema,
    system,
    prompt,
  });
}
