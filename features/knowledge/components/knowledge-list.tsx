"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { KnowledgeItem } from "@prisma/client";
import { BookOpen, Plus, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatEnumLabel } from "@/lib/utils";

import { KnowledgeFormDrawer } from "./knowledge-form-drawer";
import { BulkImportModal } from "./bulk-import-modal";

type DrawerState = { mode: "create" } | { mode: "edit"; item: KnowledgeItem };

export function KnowledgeList({
  items,
  nextCursor,
  searchParams,
}: {
  items: KnowledgeItem[];
  nextCursor: string | null;
  searchParams: Record<string, string>;
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
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <KnowledgeCard
              key={item.id}
              item={item}
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

function KnowledgeCard({ item, onClick }: { item: KnowledgeItem; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-left text-sm shadow-xs transition-all hover:-translate-y-px hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium">{item.title}</h3>
        <Badge variant="outline">{formatEnumLabel(item.category)}</Badge>
      </div>
      <p className="line-clamp-3 text-muted-foreground">{item.body}</p>
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
