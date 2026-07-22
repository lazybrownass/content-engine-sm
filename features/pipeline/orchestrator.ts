import type { BrandVoice, PipelineRun } from "@prisma/client";
import { AiRunStatus, PipelineStage } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { runOutlineStage } from "@/features/pipeline/stages/outline";
import { runDraftStage } from "@/features/pipeline/stages/draft";
import { runQualityReviewStage } from "@/features/pipeline/stages/quality-review";
import { PipelineStageError, type GenerateStageObjectOutput } from "@/features/pipeline/run-stage";
import type { KnowledgeSearchItemResult } from "@/features/knowledge/queries";

export interface RunPipelineInput {
  ownerId: string;
  topic: string;
  brandVoice: BrandVoice | null;
  knowledgeChunks?: KnowledgeSearchItemResult[];
  minQualityScore?: number;
  postId?: string;
  topicId?: string;
}

// The orchestrator stays Post-agnostic — it never imports/writes prisma.post itself.
// finalText is handed back so the caller (features/posts/actions.ts) decides what to
// do with it, keeping this module reusable/testable without a Post fixture.
export interface RunPipelineResult {
  pipelineRun: PipelineRun;
  finalText: string | null; // null only on the FAILED paths
}

// Records the full audit trail for one stage call: a FAILED row for the first
// (validation-failed) attempt if the call was retried, then a SUCCESS row for
// the final attempt. AiRun is the observability table — dropping a failed
// attempt would hide real retry cost/latency data.
async function recordStageAiRuns(
  pipelineRunId: string,
  stage: PipelineStage,
  result: GenerateStageObjectOutput<unknown>,
) {
  if (result.retried) {
    await prisma.aiRun.create({
      data: {
        pipelineRunId,
        stage,
        modelId: result.modelId,
        status: AiRunStatus.FAILED,
        errorMessage: result.firstAttemptError,
      },
    });
  }

  await prisma.aiRun.create({
    data: {
      pipelineRunId,
      stage,
      modelId: result.modelId,
      status: AiRunStatus.SUCCESS,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs: result.latencyMs,
    },
  });
}

async function advancePipelineRun(
  pipelineRunId: string,
  currentStage: PipelineStage,
  retried: boolean,
) {
  return prisma.pipelineRun.update({
    where: { id: pipelineRunId },
    data: {
      currentStage,
      retryCount: retried ? { increment: 1 } : undefined,
    },
  });
}

async function failPipeline(
  pipelineRunId: string,
  stage: PipelineStage,
  error: unknown,
): Promise<PipelineRun> {
  const message = error instanceof PipelineStageError ? error.message : String(error);
  await prisma.aiRun.create({
    data: {
      pipelineRunId,
      stage,
      modelId: "unknown",
      status: AiRunStatus.FAILED,
      errorMessage: message,
    },
  });
  return prisma.pipelineRun.update({
    where: { id: pipelineRunId },
    data: { status: "FAILED", lastError: message, completedAt: new Date() },
  });
}

export async function runPipeline({
  ownerId,
  topic,
  brandVoice,
  knowledgeChunks = [],
  minQualityScore,
  postId,
  topicId,
}: RunPipelineInput): Promise<RunPipelineResult> {
  const pipelineRun = await prisma.pipelineRun.create({
    data: {
      ownerId,
      postId,
      topicId,
      status: "RUNNING",
      currentStage: PipelineStage.OUTLINE,
      startedAt: new Date(),
    },
  });
  const pipelineRunId = pipelineRun.id;

  // Outline stage
  let outlineResult;
  try {
    outlineResult = await runOutlineStage({ topic, brandVoice, knowledgeChunks });
  } catch (error) {
    return { pipelineRun: await failPipeline(pipelineRunId, PipelineStage.OUTLINE, error), finalText: null };
  }
  await recordStageAiRuns(pipelineRunId, PipelineStage.OUTLINE, outlineResult);
  await advancePipelineRun(pipelineRunId, PipelineStage.DRAFT, outlineResult.retried);

  // Draft stage
  let draftResult;
  try {
    draftResult = await runDraftStage({
      topic,
      outline: outlineResult.output.sections,
      brandVoice,
      knowledgeChunks,
    });
  } catch (error) {
    return { pipelineRun: await failPipeline(pipelineRunId, PipelineStage.DRAFT, error), finalText: null };
  }
  await recordStageAiRuns(pipelineRunId, PipelineStage.DRAFT, draftResult);
  await advancePipelineRun(pipelineRunId, PipelineStage.GRILL_REVIEW, draftResult.retried);

  // Grill review stage
  let grillResult;
  try {
    grillResult = await runQualityReviewStage({
      draft: draftResult.output.content,
      brandVoice,
      knowledgeChunks,
      minQualityScore,
    });
  } catch (error) {
    return { pipelineRun: await failPipeline(pipelineRunId, PipelineStage.GRILL_REVIEW, error), finalText: null };
  }
  await recordStageAiRuns(pipelineRunId, PipelineStage.GRILL_REVIEW, grillResult);

  if (grillResult.passed) {
    const completedRun = await prisma.pipelineRun.update({
      where: { id: pipelineRunId },
      data: {
        status: "COMPLETED",
        qualityScore: grillResult.output.qualityScore,
        completedAt: new Date(),
        retryCount: grillResult.retried ? { increment: 1 } : undefined,
      },
    });
    return { pipelineRun: completedRun, finalText: draftResult.output.content };
  }

  // Bounded revision cycle — exactly one, never unbounded (AGENTS.md Rule 8.8).
  await prisma.pipelineRun.update({
    where: { id: pipelineRunId },
    data: {
      grillCycles: 1,
      currentStage: PipelineStage.DRAFT,
      retryCount: grillResult.retried ? { increment: 1 } : undefined,
    },
  });

  let revisedDraftResult;
  try {
    revisedDraftResult = await runDraftStage({
      topic,
      outline: outlineResult.output.sections,
      brandVoice,
      knowledgeChunks,
      revisionFeedback: grillResult.output.violations,
    });
  } catch (error) {
    return { pipelineRun: await failPipeline(pipelineRunId, PipelineStage.DRAFT, error), finalText: null };
  }
  await recordStageAiRuns(pipelineRunId, PipelineStage.DRAFT, revisedDraftResult);
  await advancePipelineRun(pipelineRunId, PipelineStage.GRILL_REVIEW, revisedDraftResult.retried);

  let revisedGrillResult;
  try {
    revisedGrillResult = await runQualityReviewStage({
      draft: revisedDraftResult.output.content,
      brandVoice,
      knowledgeChunks,
      minQualityScore,
    });
  } catch (error) {
    return { pipelineRun: await failPipeline(pipelineRunId, PipelineStage.GRILL_REVIEW, error), finalText: null };
  }
  await recordStageAiRuns(pipelineRunId, PipelineStage.GRILL_REVIEW, revisedGrillResult);

  // Regardless of the second Grill result, the run terminates here — FAILED is
  // reserved exclusively for genuine technical failures, never a still-low score
  // after the one bounded revision (AGENTS.md Rule 8.8 / docs/01-PRD.md FR-14).
  const completedRun = await prisma.pipelineRun.update({
    where: { id: pipelineRunId },
    data: {
      status: "COMPLETED",
      qualityScore: revisedGrillResult.output.qualityScore,
      completedAt: new Date(),
      retryCount: revisedGrillResult.retried ? { increment: 1 } : undefined,
    },
  });
  return { pipelineRun: completedRun, finalText: revisedDraftResult.output.content };
}
