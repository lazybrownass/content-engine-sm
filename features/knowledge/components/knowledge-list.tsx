"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { KnowledgeItem } from "@prisma/client";
import { BookOpen, Plus, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { computeRelevancePercentages } from "@/lib/knowledge/relevance";
import { formatEnumLabel } from "@/lib/utils";

import { KnowledgeFormDrawer } from "./knowledge-form-drawer";
import { BulkImportModal } from "./bulk-import-modal";

type DrawerState = { mode: "create" } | { mode: "edit"; item: KnowledgeItem };
type RelevanceInfo = { score: number; matchedContent: string };

export function KnowledgeList({
  items,
  nextCursor,
  searchParams,
  query,
  relevance,
}: {
  items: KnowledgeItem[];
  nextCursor: string | null;
  searchParams: Record<string, string>;
  query?: string;
  relevance?: Record<string, RelevanceInfo>;
}) {
  const router = useRouter();
  const [drawerState, setDrawerState] = useState<DrawerState | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  function handleSuccess() {
    setDrawerState(null);
    setImportOpen(false);
    router.refresh();
  }

  const loadMoreHref = nextCursor
    ? `?${new URLSearchParams({ ...searchParams, cursor: nextCursor }).toString()}`
    : null;

  const relevanceEntries = relevance ? Object.entries(relevance) : [];
  const relevancePercents = computeRelevancePercentages(
    relevanceEntries.map(([, info]) => info.score),
  );
  const relevanceByItemId = new Map(
    relevanceEntries.map(([id, info], index) => [
      id,
      { percent: relevancePercents[index]!, matchedContent: info.matchedContent },
    ]),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setImportOpen(true)}>
          <Upload className="size-4" />
          Import
        </Button>
        <Button onClick={() => setDrawerState({ mode: "create" })}>
          <Plus className="size-4" />
          New Item
        </Button>
      </div>

      {items.length === 0 ? (
        query ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-12 text-center">
            <BookOpen className="size-8 text-muted-foreground" />
            <h2 className="text-base font-medium">No results for &ldquo;{query}&rdquo;</h2>
            <p className="text-sm text-muted-foreground">
              Try different keywords, or browse the full knowledge base.
            </p>
            <Link
              href="/knowledge"
              className="mt-2 text-sm font-medium text-primary hover:underline"
            >
              Clear search
            </Link>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-12 text-center">
            <BookOpen className="size-8 text-muted-foreground" />
            <h2 className="text-base font-medium">No knowledge items yet</h2>
            <p className="text-sm text-muted-foreground">
              Add your first knowledge item to start building your content base.
            </p>
            <Button className="mt-2" onClick={() => setDrawerState({ mode: "create" })}>
              <Plus className="size-4" />
              Add knowledge item
            </Button>
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <KnowledgeCard
              key={item.id}
              item={item}
              relevance={relevanceByItemId.get(item.id)}
              onClick={() => setDrawerState({ mode: "edit", item })}
            />
          ))}
        </div>
      )}

      {loadMoreHref && (
        <Link
          href={loadMoreHref}
          className="self-center text-sm font-medium text-primary hover:underline"
        >
          Load more
        </Link>
      )}

      <KnowledgeFormDrawer
        open={drawerState !== null}
        onOpenChange={(open) => !open && setDrawerState(null)}
        item={drawerState?.mode === "edit" ? drawerState.item : undefined}
        onSuccess={handleSuccess}
      />
      <BulkImportModal open={importOpen} onOpenChange={setImportOpen} onSuccess={handleSuccess} />
    </div>
  );
}

function KnowledgeCard({
  item,
  relevance,
  onClick,
}: {
  item: KnowledgeItem;
  relevance?: { percent: number; matchedContent: string };
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-left text-sm shadow-xs transition-all hover:-translate-y-px hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium">{item.title}</h3>
        <div className="flex shrink-0 gap-1">
          {relevance && <Badge variant="secondary">{relevance.percent}% match</Badge>}
          <Badge variant="outline">{formatEnumLabel(item.category)}</Badge>
        </div>
      </div>
      <p className="line-clamp-3 text-muted-foreground">
        {relevance ? relevance.matchedContent : item.body}
      </p>
      {item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </button>
  );
}
