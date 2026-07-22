import type { BrandVoice } from "@prisma/client";
import { PipelineStage } from "@prisma/client";

import { buildInlineEditPrompt, type InlineEditAction } from "@/features/pipeline/prompt";
import { generateStageObject } from "@/features/pipeline/run-stage";
import { inlineEditOutputSchema } from "@/features/pipeline/schema";

const STAGE_BY_ACTION: Record<InlineEditAction, PipelineStage> = {
  rewrite: PipelineStage.INLINE_REWRITE,
  shorten: PipelineStage.INLINE_SHORTEN,
  change_hook: PipelineStage.INLINE_CHANGE_HOOK,
};

export interface RunInlineEditStageInput {
  action: InlineEditAction;
  selectedText: string;
  contextText: string;
  brandVoice: BrandVoice | null;
}

export async function runInlineEditStage({
  action,
  selectedText,
  contextText,
  brandVoice,
}: RunInlineEditStageInput) {
  const { system, prompt } = buildInlineEditPrompt({ action, selectedText, contextText, brandVoice });

  return generateStageObject({
    stage: STAGE_BY_ACTION[action],
    purpose: "inline_edit",
    schema: inlineEditOutputSchema,
    system,
    prompt,
  });
}
