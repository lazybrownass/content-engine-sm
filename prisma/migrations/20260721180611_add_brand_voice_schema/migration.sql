-- CreateTable
CREATE TABLE "brand_voices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "tone" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetAudience" TEXT,
    "forbiddenWords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "signatureHooks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "formattingRules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_voices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brand_voices_ownerId_idx" ON "brand_voices"("ownerId");

-- AddForeignKey
ALTER TABLE "brand_voices" ADD CONSTRAINT "brand_voices_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security: every owner-scoped table gets RLS + an owner-matching policy in the same migration
ALTER TABLE "brand_voices" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_full_access" ON "brand_voices"
  FOR ALL
  USING ("ownerId" = auth.uid())
  WITH CHECK ("ownerId" = auth.uid());
