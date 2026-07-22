import type { BrandVoice } from "@prisma/client";
import { PipelineStage } from "@prisma/client";

import { buildDraftPrompt } from "@/features/pipeline/prompt";
import { generateStageObject } from "@/features/pipeline/run-stage";
import { draftOutputSchema } from "@/features/pipeline/schema";
import type { KnowledgeSearchItemResult } from "@/features/knowledge/queries";

export interface RunDraftStageInput {
  topic: string;
  outline: string[];
  brandVoice: BrandVoice | null;
  knowledgeChunks: KnowledgeSearchItemResult[];
  revisionFeedback?: string[];
}

export async function runDraftStage({
  topic,
  outline,
  brandVoice,
  knowledgeChunks,
  revisionFeedback,
}: RunDraftStageInput) {
  const { system, prompt } = buildDraftPrompt({
    topic,
    outline,
    brandVoice,
    knowledgeChunks,
    revisionFeedback,
  });

  return generateStageObject({
    stage: PipelineStage.DRAFT,
    purpose: "draft",
    schema: draftOutputSchema,
    system,
    prompt,
  });
}
