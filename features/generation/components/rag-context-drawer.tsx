"use client";

import { useState } from "react";
import type { KnowledgeSearchItemResult } from "@/features/knowledge/queries";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { previewKnowledgeContext } from "@/features/generation/actions";

export function RagContextDrawer({ prompt }: { prompt: string }) {
  const [chunks, setChunks] = useState<KnowledgeSearchItemResult[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleOpenChange(open: boolean) {
    if (!open) return;
    setLoading(true);
    setChunks(await previewKnowledgeContext(prompt));
    setLoading(false);
  }

  return (
    <Sheet onOpenChange={handleOpenChange}>
      <SheetTrigger render={<Button type="button" variant="outline" size="sm" />}>
        Preview knowledge context
      </SheetTrigger>
      <SheetContent className="flex flex-col gap-4 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Knowledge context</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-3 px-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Searching the knowledge base...</p>
          ) : !chunks || chunks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No knowledge base matches for this prompt yet — generation will proceed without
              grounding.
            </p>
          ) : (
            chunks.map((chunk) => (
              <div key={chunk.item.id} className="rounded-lg border p-3">
                <p className="text-sm font-medium">{chunk.item.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{chunk.matchedContent}</p>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
