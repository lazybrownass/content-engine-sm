-- CreateTable
CREATE TABLE "analytics_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "postId" UUID NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "impressions" INTEGER,
    "reactions" INTEGER,
    "comments" INTEGER,
    "reposts" INTEGER,
    "clicks" INTEGER,
    "engagementRate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "style_memory_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "avgSentenceLength" DOUBLE PRECISION,
    "emojiUsageRate" DOUBLE PRECISION,
    "hookPatterns" JSONB NOT NULL DEFAULT '[]',
    "ctaPatterns" JSONB NOT NULL DEFAULT '[]',
    "favoriteVocabulary" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "avoidedPhrases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "repeatedPhraseIndex" JSONB NOT NULL DEFAULT '{}',
    "lastComputedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "style_memory_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "style_memory_examples" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "styleMemoryProfileId" UUID NOT NULL,
    "postId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "style_memory_examples_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analytics_snapshots_postId_capturedAt_idx" ON "analytics_snapshots"("postId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "style_memory_profiles_ownerId_key" ON "style_memory_profiles"("ownerId");

-- CreateIndex
CREATE INDEX "style_memory_examples_styleMemoryProfileId_idx" ON "style_memory_examples"("styleMemoryProfileId");

-- AddForeignKey
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "style_memory_profiles" ADD CONSTRAINT "style_memory_profiles_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "style_memory_examples" ADD CONSTRAINT "style_memory_examples_styleMemoryProfileId_fkey" FOREIGN KEY ("styleMemoryProfileId") REFERENCES "style_memory_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "style_memory_examples" ADD CONSTRAINT "style_memory_examples_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-Level Security: every owner-scoped table gets RLS + an owner-matching policy in the same migration.
-- analytics_snapshots and style_memory_examples have no direct ownerId; ownership is proven via a join
-- (-> posts.ownerId / style_memory_profiles.ownerId), the same pattern used for schedules/publishing_jobs.
ALTER TABLE "analytics_snapshots" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_full_access" ON "analytics_snapshots"
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM "posts" p WHERE p."id" = "analytics_snapshots"."postId" AND p."ownerId" = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM "posts" p WHERE p."id" = "analytics_snapshots"."postId" AND p."ownerId" = auth.uid())
  );

ALTER TABLE "style_memory_profiles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_full_access" ON "style_memory_profiles"
  FOR ALL
  USING ("ownerId" = auth.uid())
  WITH CHECK ("ownerId" = auth.uid());

ALTER TABLE "style_memory_examples" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_full_access" ON "style_memory_examples"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "style_memory_profiles" smp
      WHERE smp."id" = "style_memory_examples"."styleMemoryProfileId" AND smp."ownerId" = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "style_memory_profiles" smp
      WHERE smp."id" = "style_memory_examples"."styleMemoryProfileId" AND smp."ownerId" = auth.uid()
    )
  );
