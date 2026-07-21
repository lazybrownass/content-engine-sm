export interface ChunkTextOptions {
  maxChunkChars?: number;
}

// bge-base-en-v1.5 has a 512-token limit; ~1000 chars is comfortably under that for
// English prose (roughly 150-250 tokens), leaving headroom without needing exact
// token counting for a personal knowledge base's short-to-medium notes.
const DEFAULT_MAX_CHUNK_CHARS = 1000;

function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

// Greedily packs pieces into chunks up to maxChunkChars, joined by `joiner`. A single piece
// larger than maxChunkChars becomes its own (over-budget) chunk rather than being dropped.
function packGreedily(pieces: string[], maxChunkChars: number, joiner: string): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLength = 0;

  for (const piece of pieces) {
    const lengthIfAdded = currentLength + (current.length > 0 ? joiner.length : 0) + piece.length;

    if (current.length > 0 && lengthIfAdded > maxChunkChars) {
      chunks.push(current.join(joiner));
      current = [piece];
      currentLength = piece.length;
    } else {
      current.push(piece);
      currentLength = lengthIfAdded;
    }
  }

  if (current.length > 0) {
    chunks.push(current.join(joiner));
  }

  return chunks;
}

// Splits a KnowledgeItem's markdown body into embeddable chunks: paragraphs are packed
// greedily up to maxChunkChars; a single paragraph that alone exceeds the budget falls back
// to sentence-boundary packing. No overlap between chunks — personal notes are short and
// self-contained per item, so overlap (a mitigation for large documents split mid-topic)
// isn't warranted here.
export function chunkText(body: string, options: ChunkTextOptions = {}): string[] {
  const maxChunkChars = options.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS;
  const trimmed = body.trim();
  if (!trimmed) return [];

  const paragraphs = splitIntoParagraphs(trimmed);
  const pieces = paragraphs.flatMap((paragraph) =>
    paragraph.length > maxChunkChars
      ? packGreedily(splitIntoSentences(paragraph), maxChunkChars, " ")
      : [paragraph],
  );

  return packGreedily(pieces, maxChunkChars, "\n\n");
}
