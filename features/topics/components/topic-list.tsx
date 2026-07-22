"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Topic, TopicStatus } from "@prisma/client";
import { Lightbulb, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatEnumLabel } from "@/lib/utils";
import { createPostFromTopic } from "@/features/posts/actions";
import { rejectTopic } from "@/features/topics/actions";

import { TopicEditSheet } from "./topic-edit-sheet";

const STATUS_TABS: { id: TopicStatus | "ALL"; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "SUGGESTED", label: "Suggested" },
  { id: "ACCEPTED", label: "Accepted" },
  { id: "REJECTED", label: "Rejected" },
];

export function TopicList({
  topics,
  nextCursor,
  searchParams,
  currentStatus,
}: {
  topics: Topic[];
  nextCursor: string | null;
  searchParams: Record<string, string>;
  currentStatus?: string;
}) {
  const router = useRouter();
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);

  function handleSuccess() {
    setEditingTopic(null);
    router.refresh();
  }

  const loadMoreHref = nextCursor
    ? `?${new URLSearchParams({ ...searchParams, cursor: nextCursor }).toString()}`
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1.5" role="tablist">
        {STATUS_TABS.map(({ id, label }) => {
          const params: Record<string, string> = id === "ALL" ? {} : { status: id };
          const href = Object.keys(params).length > 0 ? `?${new URLSearchParams(params).toString()}` : "?";
          const isActive = id === "ALL" ? !currentStatus : currentStatus === id;
          return (
            <Link
              key={id}
              href={href}
              role="tab"
              aria-selected={isActive}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-transparent hover:bg-muted",
              )}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {topics.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-12 text-center">
          <Lightbulb className="size-8 text-muted-foreground" />
          <h2 className="text-base font-medium">No topics yet</h2>
          <p className="text-sm text-muted-foreground">
            Click &ldquo;Generate suggestions&rdquo; to get 5-10 post ideas grounded in your knowledge base.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {topics.map((topic) => (
            <TopicCard
              key={topic.id}
              topic={topic}
              onEdit={() => setEditingTopic(topic)}
              onRefresh={() => router.refresh()}
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

      <TopicEditSheet
        topic={editingTopic}
        onOpenChange={(open) => !open && setEditingTopic(null)}
        onSuccess={handleSuccess}
      />
    </div>
  );
}

function TopicCard({
  topic,
  onEdit,
  onRefresh,
}: {
  topic: Topic;
  onEdit: () => void;
  onRefresh: () => void;
}) {
  const router = useRouter();
  const [accepting, startAccepting] = useTransition();
  const [rejecting, startRejecting] = useTransition();

  function handleAccept() {
    startAccepting(async () => {
      const result = await createPostFromTopic(topic.id);
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Post generated");
      router.push(`/posts/${result.data.id}/edit`);
    });
  }

  function handleReject() {
    startRejecting(async () => {
      const result = await rejectTopic(topic.id);
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      onRefresh();
    });
  }

  const isSuggested = topic.status === "SUGGESTED";
  const busy = accepting || rejecting;

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-sm shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-medium">{topic.title}</h2>
        <div className="flex shrink-0 gap-1">
          {topic.score != null && <Badge variant="secondary">{Math.round(topic.score * 100)}%</Badge>}
          <Badge variant="outline">{formatEnumLabel(topic.pillar)}</Badge>
        </div>
      </div>
      <p className="line-clamp-3 text-muted-foreground">{topic.rationale}</p>
      {!isSuggested && <Badge className="self-start">{formatEnumLabel(topic.status)}</Badge>}
      {isSuggested && (
        <div className="mt-1 flex items-center gap-2">
          <Button size="sm" onClick={handleAccept} disabled={busy}>
            {accepting ? "Generating..." : "Accept"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleReject} disabled={busy}>
            Reject
          </Button>
          <Button size="sm" variant="ghost" onClick={onEdit} disabled={busy}>
            <Pencil className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
