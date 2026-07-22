"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatEnumLabel } from "@/lib/utils";
import { archivePost } from "@/features/posts/actions";
import type { PostWithTopic } from "@/features/posts/queries";

export function PostList({
  posts,
  nextCursor,
  searchParams,
}: {
  posts: PostWithTopic[];
  nextCursor: string | null;
  searchParams: Record<string, string>;
}) {
  const router = useRouter();
  const [archivingId, setArchivingId] = useState<string | null>(null);

  async function handleArchive() {
    if (!archivingId) return;
    const result = await archivePost(archivingId);
    setArchivingId(null);
    if (!result.success) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Post archived");
    router.refresh();
  }

  const loadMoreHref = nextCursor
    ? `?${new URLSearchParams({ ...searchParams, cursor: nextCursor }).toString()}`
    : null;

  return (
    <div className="flex flex-col gap-4">
      {posts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-12 text-center">
          <FileText className="size-8 text-muted-foreground" />
          <h2 className="text-base font-medium">No posts yet</h2>
          <p className="text-sm text-muted-foreground">
            Accept a topic suggestion on the Topics page to generate your first post.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <div
              key={post.id}
              className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-sm shadow-xs transition-all hover:-translate-y-px hover:shadow-sm"
            >
              <Link href={`/posts/${post.id}/edit`} className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium">{post.topic?.title ?? "Untitled post"}</h3>
                  <div className="flex shrink-0 gap-1">
                    {post.qualityScore != null && (
                      <Badge variant="secondary">{post.qualityScore}/100</Badge>
                    )}
                    <Badge variant="outline">{formatEnumLabel(post.pillar)}</Badge>
                  </div>
                </div>
                <p className="line-clamp-3 text-muted-foreground">
                  {post.finalText ?? "No draft content yet."}
                </p>
                <Badge className="self-start">{formatEnumLabel(post.status)}</Badge>
              </Link>
              {post.status !== "ARCHIVED" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-end"
                  onClick={() => setArchivingId(post.id)}
                >
                  Archive
                </Button>
              )}
            </div>
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

      <Dialog open={archivingId !== null} onOpenChange={(open) => !open && setArchivingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive this post?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            It will be hidden from the active list but not deleted.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchivingId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleArchive}>
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
