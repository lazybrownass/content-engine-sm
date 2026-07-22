-- CreateEnum
CREATE TYPE "TopicStatus" AS ENUM ('SUGGESTED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'PIPELINE_RUNNING', 'NEEDS_OWNER_REVIEW', 'IN_EDIT', 'APPROVED', 'FAILED', 'ARCHIVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PipelineStage" ADD VALUE 'TOPIC_GENERATION';
ALTER TYPE "PipelineStage" ADD VALUE 'INLINE_REWRITE';
ALTER TYPE "PipelineStage" ADD VALUE 'INLINE_SHORTEN';
ALTER TYPE "PipelineStage" ADD VALUE 'INLINE_CHANGE_HOOK';

-- AlterTable
ALTER TABLE "pipeline_runs" ADD COLUMN     "postId" UUID,
ADD COLUMN     "topicId" UUID;

-- CreateTable
CREATE TABLE "topics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "pillar" "Pillar" NOT NULL,
    "sourceKnowledgeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "score" DOUBLE PRECISION,
    "status" "TopicStatus" NOT NULL DEFAULT 'SUGGESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "topicId" UUID,
    "pillar" "Pillar" NOT NULL,
    "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
    "finalText" TEXT,
    "wordCount" INTEGER,
    "qualityScore" INTEGER,
    "grillCycles" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "topics_ownerId_status_idx" ON "topics"("ownerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "posts_topicId_key" ON "posts"("topicId");

-- CreateIndex
CREATE INDEX "posts_ownerId_status_idx" ON "posts"("ownerId", "status");

-- CreateIndex
CREATE INDEX "posts_ownerId_pillar_idx" ON "posts"("ownerId", "pillar");

-- CreateIndex
CREATE INDEX "pipeline_runs_postId_idx" ON "pipeline_runs"("postId");

-- CreateIndex
CREATE INDEX "pipeline_runs_topicId_idx" ON "pipeline_runs"("topicId");

-- AddForeignKey
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-Level Security: every owner-scoped table gets RLS + an owner-matching policy in the same migration
ALTER TABLE "topics" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_full_access" ON "topics"
  FOR ALL
  USING ("ownerId" = auth.uid())
  WITH CHECK ("ownerId" = auth.uid());

ALTER TABLE "posts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_full_access" ON "posts"
  FOR ALL
  USING ("ownerId" = auth.uid())
  WITH CHECK ("ownerId" = auth.uid());
