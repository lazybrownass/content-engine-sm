import { prisma } from "@/lib/db/prisma";
import type { StyleMemoryForPrompt } from "@/features/generation/prompt";

const MAX_EXAMPLE_HOOKS = 3;

function firstLine(text: string): string {
  return text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
}

// Loads the owner's style memory in the shape the prompt builders need, or null
// when no profile has been computed yet (below the sample threshold). Takes an
// ownerId directly — callers (the generate route, the pipeline) have already
// authenticated and pass it through.
export async function getStyleMemoryForPrompt(ownerId: string): Promise<StyleMemoryForPrompt | null> {
  const profile = await prisma.styleMemoryProfile.findUnique({
    where: { ownerId },
    include: {
      examples: {
        where: { post: { isNot: null } },
        include: { post: { select: { finalText: true } } },
        orderBy: { createdAt: "desc" },
        take: MAX_EXAMPLE_HOOKS,
      },
    },
  });

  if (!profile || profile.lastComputedAt === null) return null;

  const hookPatterns = Array.isArray(profile.hookPatterns)
    ? (profile.hookPatterns as unknown as { pattern: string; frequency: number }[])
    : [];

  const exampleHooks = profile.examples
    .map((example) => (example.post?.finalText ? firstLine(example.post.finalText) : ""))
    .filter(Boolean);

  return {
    avgSentenceLength: profile.avgSentenceLength,
    emojiUsageRate: profile.emojiUsageRate,
    hookPatterns,
    favoriteVocabulary: profile.favoriteVocabulary,
    avoidedPhrases: profile.avoidedPhrases,
    exampleHooks,
  };
}
