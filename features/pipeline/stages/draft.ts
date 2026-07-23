import type { BrandVoice } from "@prisma/client";
import { PipelineStage } from "@prisma/client";

import { buildDraftPrompt } from "@/features/pipeline/prompt";
import { generateStageObject } from "@/features/pipeline/run-stage";
import { draftOutputSchema } from "@/features/pipeline/schema";
import type { KnowledgeSearchItemResult } from "@/features/knowledge/queries";
import type { StyleMemoryForPrompt } from "@/features/generation/prompt";

export interface RunDraftStageInput {
  topic: string;
  outline: string[];
  brandVoice: BrandVoice | null;
  knowledgeChunks: KnowledgeSearchItemResult[];
  revisionFeedback?: string[];
  styleMemory?: StyleMemoryForPrompt | null;
}

export async function runDraftStage({
  topic,
  outline,
  brandVoice,
  knowledgeChunks,
  revisionFeedback,
  styleMemory,
}: RunDraftStageInput) {
  const { system, prompt } = buildDraftPrompt({
    topic,
    outline,
    brandVoice,
    knowledgeChunks,
    revisionFeedback,
    styleMemory,
  });

  return generateStageObject({
    stage: PipelineStage.DRAFT,
    purpose: "draft",
    schema: draftOutputSchema,
    system,
    prompt,
  });
}
