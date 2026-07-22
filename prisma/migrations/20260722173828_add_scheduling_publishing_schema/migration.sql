-- CreateEnum
CREATE TYPE "PublishingProviderType" AS ENUM ('MANUAL', 'N8N', 'MAKE');

-- CreateEnum
CREATE TYPE "PublishingJobStatus" AS ENUM ('SCHEDULED', 'DISPATCHED', 'PUBLISHED', 'PUBLISH_UNCONFIRMED', 'FAILED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PostStatus" ADD VALUE 'SCHEDULED';
ALTER TYPE "PostStatus" ADD VALUE 'PUBLISHING';
ALTER TYPE "PostStatus" ADD VALUE 'PUBLISHED';
ALTER TYPE "PostStatus" ADD VALUE 'PUBLISH_UNCONFIRMED';

-- CreateTable
CREATE TABLE "schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "postId" UUID NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_providers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "type" "PublishingProviderType" NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "configRef" TEXT,
    "signingSecretRef" TEXT,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publishing_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scheduleId" UUID NOT NULL,
    "automationProviderId" UUID NOT NULL,
    "status" "PublishingJobStatus" NOT NULL DEFAULT 'SCHEDULED',
    "dispatchedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "linkedinUrl" TEXT,
    "errorMessage" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publishing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schedules_postId_key" ON "schedules"("postId");

-- CreateIndex
CREATE INDEX "schedules_scheduledAt_idx" ON "schedules"("scheduledAt");

-- CreateIndex
CREATE INDEX "automation_providers_ownerId_type_idx" ON "automation_providers"("ownerId", "type");

-- CreateIndex
CREATE INDEX "publishing_jobs_status_idx" ON "publishing_jobs"("status");

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_providers" ADD CONSTRAINT "automation_providers_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publishing_jobs" ADD CONSTRAINT "publishing_jobs_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publishing_jobs" ADD CONSTRAINT "publishing_jobs_automationProviderId_fkey" FOREIGN KEY ("automationProviderId") REFERENCES "automation_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security: every owner-scoped table gets RLS + an owner-matching policy in the same migration
ALTER TABLE "schedules" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_full_access" ON "schedules"
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM "posts" p WHERE p."id" = "schedules"."postId" AND p."ownerId" = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM "posts" p WHERE p."id" = "schedules"."postId" AND p."ownerId" = auth.uid())
  );

ALTER TABLE "automation_providers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_full_access" ON "automation_providers"
  FOR ALL
  USING ("ownerId" = auth.uid())
  WITH CHECK ("ownerId" = auth.uid());

ALTER TABLE "publishing_jobs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_full_access" ON "publishing_jobs"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "automation_providers" ap
      WHERE ap."id" = "publishing_jobs"."automationProviderId" AND ap."ownerId" = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "automation_providers" ap
      WHERE ap."id" = "publishing_jobs"."automationProviderId" AND ap."ownerId" = auth.uid()
    )
  );
