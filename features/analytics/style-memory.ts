// Pure, DB-free style-memory computation. Turns the owner's recent published
// posts (with entered engagement metrics) into an aggregate style profile plus
// the ids of the top performers to keep as "winning" examples. Kept pure so the
// aggregation logic is unit-testable against fixtures (docs/06 Phase 5 Testing).

export const MIN_SAMPLE_POSTS = 10; // below this the loop stays at baseline (docs/06 risk note)
const TRAILING_WINDOW = 20; // only the most recent N scored posts shape the profile
const TOP_WINNERS = 5; // how many top performers become style examples
const MAX_VOCABULARY = 15;
const MIN_VOCAB_FREQUENCY = 2;
const MIN_REPEATED_PHRASE_COUNT = 2;
const AVOIDED_PHRASE_COUNT = 3; // a trigram this frequent across posts reads as a verbal tic

export interface StyleSamplePost {
  id: string;
  finalText: string;
  engagementRate: number | null;
}

export interface PatternFrequency {
  pattern: string;
  frequency: number;
}

export interface ComputedStyleProfile {
  avgSentenceLength: number | null;
  emojiUsageRate: number | null; // emoji per 100 words
  hookPatterns: PatternFrequency[];
  ctaPatterns: PatternFrequency[];
  favoriteVocabulary: string[];
  avoidedPhrases: string[];
  repeatedPhraseIndex: Record<string, number>;
  winnerPostIds: string[];
}

const EMPTY_PROFILE: ComputedStyleProfile = {
  avgSentenceLength: null,
  emojiUsageRate: null,
  hookPatterns: [],
  ctaPatterns: [],
  favoriteVocabulary: [],
  avoidedPhrases: [],
  repeatedPhraseIndex: {},
  winnerPostIds: [],
};

// Small stopword set — enough to keep favoriteVocabulary meaningful without a dependency.
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "of", "to", "in", "on", "for", "with",
  "at", "by", "from", "as", "is", "are", "was", "were", "be", "been", "being", "this", "that",
  "these", "those", "it", "its", "i", "you", "we", "they", "he", "she", "my", "your", "our",
  "their", "me", "us", "them", "so", "not", "no", "do", "does", "did", "have", "has", "had",
  "will", "would", "can", "could", "should", "just", "about", "into", "than", "too", "very",
  "all", "any", "more", "most", "some", "such", "only", "own", "same", "up", "out", "what",
]);

const EMOJI_RE = /\p{Extended_Pictographic}/gu;

function lines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function sentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function words(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(EMOJI_RE, " ")
    .split(/[^a-z0-9']+/)
    .filter(Boolean);
}

// Deduplicate a list of strings into { pattern, frequency }, most frequent first.
function toFrequencies(values: string[]): PatternFrequency[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([pattern, frequency]) => ({ pattern, frequency }))
    .sort((a, b) => b.frequency - a.frequency);
}

export function computeStyleProfile(posts: StyleSamplePost[]): ComputedStyleProfile {
  // Only posts with an entered engagement metric count toward the learning loop.
  const scored = posts.filter((p) => p.engagementRate !== null && p.finalText.trim().length > 0);
  if (scored.length < MIN_SAMPLE_POSTS) {
    return EMPTY_PROFILE;
  }

  // Caller passes posts most-recent-first; the profile reflects the trailing window.
  const window = scored.slice(0, TRAILING_WINDOW);
  const winners = [...window]
    .sort((a, b) => (b.engagementRate ?? 0) - (a.engagementRate ?? 0))
    .slice(0, TOP_WINNERS);

  // Sentence length + emoji rate across the whole window.
  const allSentences = window.flatMap((p) => sentences(p.finalText));
  const totalWords = window.reduce((sum, p) => sum + words(p.finalText).length, 0);
  const totalEmoji = window.reduce((sum, p) => sum + (p.finalText.match(EMOJI_RE)?.length ?? 0), 0);

  const avgSentenceLength =
    allSentences.length > 0
      ? allSentences.reduce((sum, s) => sum + words(s).length, 0) / allSentences.length
      : null;
  const emojiUsageRate = totalWords > 0 ? (totalEmoji / totalWords) * 100 : null;

  // Hooks/CTAs are the first/last line of each winning post.
  const hookPatterns = toFrequencies(winners.map((p) => lines(p.finalText)[0]).filter(Boolean));
  const ctaPatterns = toFrequencies(winners.map((p) => lines(p.finalText).at(-1)!).filter(Boolean));

  // Favorite vocabulary: frequent non-stopword tokens across the winners.
  const vocabCounts = new Map<string, number>();
  for (const post of winners) {
    for (const token of tokens(post.finalText)) {
      if (token.length < 3 || STOPWORDS.has(token)) continue;
      vocabCounts.set(token, (vocabCounts.get(token) ?? 0) + 1);
    }
  }
  const favoriteVocabulary = [...vocabCounts.entries()]
    .filter(([, count]) => count >= MIN_VOCAB_FREQUENCY)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_VOCABULARY)
    .map(([token]) => token);

  // Repeated trigrams across the window, and the most over-repeated ones to avoid.
  const repeatedPhraseIndex: Record<string, number> = {};
  for (const post of window) {
    const toks = tokens(post.finalText);
    for (let i = 0; i + 2 < toks.length; i++) {
      const phrase = `${toks[i]} ${toks[i + 1]} ${toks[i + 2]}`;
      repeatedPhraseIndex[phrase] = (repeatedPhraseIndex[phrase] ?? 0) + 1;
    }
  }
  for (const phrase of Object.keys(repeatedPhraseIndex)) {
    if (repeatedPhraseIndex[phrase] < MIN_REPEATED_PHRASE_COUNT) delete repeatedPhraseIndex[phrase];
  }
  const avoidedPhrases = Object.entries(repeatedPhraseIndex)
    .filter(([, count]) => count >= AVOIDED_PHRASE_COUNT)
    .sort((a, b) => b[1] - a[1])
    .map(([phrase]) => phrase);

  return {
    avgSentenceLength,
    emojiUsageRate,
    hookPatterns,
    ctaPatterns,
    favoriteVocabulary,
    avoidedPhrases,
    repeatedPhraseIndex,
    winnerPostIds: winners.map((p) => p.id),
  };
}
