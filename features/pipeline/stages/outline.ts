import type { BrandVoice } from "@prisma/client";
import { PipelineStage } from "@prisma/client";

import { buildOutlinePrompt } from "@/features/pipeline/prompt";
import { generateStageObject } from "@/features/pipeline/run-stage";
import { outlineOutputSchema } from "@/features/pipeline/schema";
import type { KnowledgeSearchItemResult } from "@/features/knowledge/queries";

export interface RunOutlineStageInput {
  topic: string;
  brandVoice: BrandVoice | null;
  knowledgeChunks: KnowledgeSearchItemResult[];
}

export async function runOutlineStage({ topic, brandVoice, knowledgeChunks }: RunOutlineStageInput) {
  const { system, prompt } = buildOutlinePrompt({ topic, brandVoice, knowledgeChunks });

  return generateStageObject({
    stage: PipelineStage.OUTLINE,
    purpose: "outline",
    schema: outlineOutputSchema,
    system,
    prompt,
  });
}
