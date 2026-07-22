-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('OUTLINE', 'DRAFT', 'GRILL_REVIEW');

-- CreateEnum
CREATE TYPE "PipelineRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'PAUSED', 'FAILED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AiRunStatus" AS ENUM ('SUCCESS', 'FAILED', 'TIMEOUT', 'RATE_LIMITED');

-- CreateTable
CREATE TABLE "pipeline_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "status" "PipelineRunStatus" NOT NULL DEFAULT 'QUEUED',
    "currentStage" "PipelineStage",
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "qualityScore" INTEGER,
    "grillCycles" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pipelineRunId" UUID NOT NULL,
    "stage" "PipelineStage" NOT NULL,
    "modelId" TEXT NOT NULL,
    "status" "AiRunStatus" NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "latencyMs" INTEGER,
    "costUsd" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pipeline_runs_ownerId_idx" ON "pipeline_runs"("ownerId");

-- CreateIndex
CREATE INDEX "pipeline_runs_ownerId_status_idx" ON "pipeline_runs"("ownerId", "status");

-- CreateIndex
CREATE INDEX "ai_runs_pipelineRunId_idx" ON "ai_runs"("pipelineRunId");

-- CreateIndex
CREATE INDEX "ai_runs_stage_status_idx" ON "ai_runs"("stage", "status");

-- AddForeignKey
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_pipelineRunId_fkey" FOREIGN KEY ("pipelineRunId") REFERENCES "pipeline_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security: every owner-scoped table gets RLS + an owner-matching policy in the same migration
ALTER TABLE "pipeline_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_runs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_full_access" ON "pipeline_runs"
  FOR ALL
  USING ("ownerId" = auth.uid())
  WITH CHECK ("ownerId" = auth.uid());

-- ai_runs has no direct ownerId column; scope via its parent pipeline_runs row
CREATE POLICY "owner_full_access" ON "ai_runs"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "pipeline_runs" pr
      WHERE pr."id" = "ai_runs"."pipelineRunId" AND pr."ownerId" = auth.uid()
    )
  );
