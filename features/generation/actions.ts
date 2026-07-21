"use server";

import { searchKnowledgeItems, type KnowledgeSearchItemResult } from "@/features/knowledge/queries";

// Read-only, but exposed as a Server Action ("use server") rather than a plain
// queries.ts export so the client-side RAG context drawer can call it directly
// as the prompt is edited.
export async function previewKnowledgeContext(prompt: string): Promise<KnowledgeSearchItemResult[]> {
  const trimmed = prompt.trim();
  if (!trimmed) return [];
  return searchKnowledgeItems(trimmed, 5);
}
