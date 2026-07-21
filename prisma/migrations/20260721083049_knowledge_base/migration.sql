-- CreateEnum
CREATE TYPE "KnowledgeCategory" AS ENUM ('PROJECT', 'PRODUCT', 'CASE_STUDY', 'CLIENT_WIN', 'LESSON_LEARNED', 'SERVICE', 'PORTFOLIO_ITEM', 'FAQ', 'WRITING_STYLE_NOTE', 'BRAND_VOICE_NOTE', 'INDUSTRY', 'TARGET_CLIENT', 'EXPERIENCE', 'PREVIOUS_POST', 'IDEA');

-- CreateEnum
CREATE TYPE "Pillar" AS ENUM ('BUILD_IN_PUBLIC', 'CASE_STUDY', 'TECHNICAL_INSIGHT', 'FOUNDER_STORY', 'LESSON_LEARNED', 'EDUCATIONAL', 'MARKETING_BUSINESS_GROWTH');

-- CreateTable
CREATE TABLE "knowledge_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "category" "KnowledgeCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pillarHints" "Pillar"[] DEFAULT ARRAY[]::"Pillar"[],
    "sourceUrl" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_chunks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "knowledgeItemId" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(768),
    "embeddingModel" TEXT,
    "embeddingStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_items_ownerId_category_idx" ON "knowledge_items"("ownerId", "category");

-- CreateIndex
CREATE INDEX "knowledge_items_ownerId_archived_idx" ON "knowledge_items"("ownerId", "archived");

-- CreateIndex
CREATE INDEX "knowledge_chunks_knowledgeItemId_idx" ON "knowledge_chunks"("knowledgeItemId");

-- AddForeignKey
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "knowledge_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Vector index for approximate nearest-neighbor search (Prisma has no native type for this)
CREATE INDEX "knowledge_chunks_embedding_idx"
  ON "knowledge_chunks"
  USING ivfflat ("embedding" vector_cosine_ops)
  WITH (lists = 100);

-- Full-text search: generated tsvector column + GIN index, keyword-search fallback/complement to the vector index
ALTER TABLE "knowledge_items" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', "title" || ' ' || "body")) STORED;

CREATE INDEX "knowledge_items_search_idx"
  ON "knowledge_items" USING GIN ("search_vector");

-- Row-Level Security: every owner-scoped table gets RLS + an owner-matching policy in the same migration
ALTER TABLE "knowledge_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "knowledge_chunks" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_full_access" ON "knowledge_items"
  FOR ALL
  USING ("ownerId" = auth.uid())
  WITH CHECK ("ownerId" = auth.uid());

-- knowledge_chunks has no direct ownerId column; scope via its parent knowledge_items row
CREATE POLICY "owner_full_access" ON "knowledge_chunks"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "knowledge_items" ki
      WHERE ki."id" = "knowledge_chunks"."knowledgeItemId" AND ki."ownerId" = auth.uid()
    )
  );

