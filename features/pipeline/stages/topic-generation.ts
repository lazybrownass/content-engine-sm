import { PipelineStage } from "@prisma/client";

import { buildTopicGenerationPrompt } from "@/features/pipeline/prompt";
import { generateStageObject } from "@/features/pipeline/run-stage";
import { topicGenerationOutputSchema } from "@/features/pipeline/schema";
import type { KnowledgeSearchItemResult } from "@/features/knowledge/queries";

export interface RunTopicGenerationStageInput {
  knowledgeStatsSummary: string;
  existingTitles: string[];
  knowledgeChunks: KnowledgeSearchItemResult[];
}

export async function runTopicGenerationStage({
  knowledgeStatsSummary,
  existingTitles,
  knowledgeChunks,
}: RunTopicGenerationStageInput) {
  const { system, prompt } = buildTopicGenerationPrompt({
    knowledgeStatsSummary,
    existingTitles,
    knowledgeChunks,
  });

  return generateStageObject({
    stage: PipelineStage.TOPIC_GENERATION,
    purpose: "topic_generation",
    schema: topicGenerationOutputSchema,
    system,
    prompt,
  });
}
