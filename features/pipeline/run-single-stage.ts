import { AiRunStatus, type PipelineRun, type PipelineStage } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { PipelineStageError, type GenerateStageObjectOutput } from "@/features/pipeline/run-stage";

// A single-stage counterpart to orchestrator.ts's runPipeline() for stages that
// never participate in the OUTLINE -> DRAFT -> GRILL_REVIEW loop (topic generation,
// inline editor actions). Deliberately duplicates orchestrator.ts's AiRun/PipelineRun
// bookkeeping (~20 lines) rather than sharing it — those helpers are private, already
// covered by pipeline-orchestrator.test.ts, and untouched by anything else; refactoring
// them to serve a second caller mid-phase would add risk with no functional need. If a
// third caller appears, extract the shared bookkeeping then (rule of three).
export interface RunSingleStagePipelineInput<T> {
  ownerId: string;
  stage: PipelineStage;
  postId?: string;
  topicId?: string;
  runStage: () => Promise<GenerateStageObjectOutput<T>>;
}

export interface RunSingleStagePipelineResult<T> {
  pipelineRun: PipelineRun;
  output: T;
}

export async function runSingleStagePipeline<T>({
  ownerId,
  stage,
  postId,
  topicId,
  runStage,
}: RunSingleStagePipelineInput<T>): Promise<RunSingleStagePipelineResult<T>> {
  const pipelineRun = await prisma.pipelineRun.create({
    data: {
      ownerId,
      postId,
      topicId,
      status: "RUNNING",
      currentStage: stage,
      startedAt: new Date(),
    },
  });

  let result: GenerateStageObjectOutput<T>;
  try {
    result = await runStage();
  } catch (error) {
    const message = error instanceof PipelineStageError ? error.message : String(error);
    await prisma.aiRun.create({
      data: {
        pipelineRunId: pipelineRun.id,
        stage,
        modelId: "unknown",
        status: AiRunStatus.FAILED,
        errorMessage: message,
      },
    });
    await prisma.pipelineRun.update({
      where: { id: pipelineRun.id },
      data: { status: "FAILED", lastError: message, completedAt: new Date() },
    });
    throw error;
  }

  if (result.retried) {
    await prisma.aiRun.create({
      data: {
        pipelineRunId: pipelineRun.id,
        stage,
        modelId: result.modelId,
        status: AiRunStatus.FAILED,
        errorMessage: result.firstAttemptError,
      },
    });
  }

  await prisma.aiRun.create({
    data: {
      pipelineRunId: pipelineRun.id,
      stage,
      modelId: result.modelId,
      status: AiRunStatus.SUCCESS,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs: result.latencyMs,
    },
  });

  const completedRun = await prisma.pipelineRun.update({
    where: { id: pipelineRun.id },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      retryCount: result.retried ? { increment: 1 } : undefined,
    },
  });

  return { pipelineRun: completedRun, output: result.output };
}
