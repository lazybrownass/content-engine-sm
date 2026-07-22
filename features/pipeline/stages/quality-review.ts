import type { BrandVoice } from "@prisma/client";
import { PipelineStage } from "@prisma/client";

import { buildGrillPrompt } from "@/features/pipeline/prompt";
import { generateStageObject } from "@/features/pipeline/run-stage";
import { grillModelOutputSchema } from "@/features/pipeline/schema";
import type { KnowledgeSearchItemResult } from "@/features/knowledge/queries";

// TODO: move to Settings.minQualityScore once that field exists (full Phase 2
// schema work, docs/06-Implementation-Plan.md).
export const DEFAULT_MIN_QUALITY_SCORE = 85;

export interface RunQualityReviewStageInput {
  draft: string;
  brandVoice: BrandVoice | null;
  knowledgeChunks: KnowledgeSearchItemResult[];
  minQualityScore?: number;
}

export async function runQualityReviewStage({
  draft,
  brandVoice,
  knowledgeChunks,
  minQualityScore = DEFAULT_MIN_QUALITY_SCORE,
}: RunQualityReviewStageInput) {
  const { system, prompt } = buildGrillPrompt({ draft, brandVoice, knowledgeChunks });

  const result = await generateStageObject({
    stage: PipelineStage.GRILL_REVIEW,
    purpose: "grill_review",
    schema: grillModelOutputSchema,
    system,
    prompt,
  });

  return {
    ...result,
    passed: result.output.qualityScore >= minQualityScore,
  };
}
