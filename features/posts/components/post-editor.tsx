"use client";

import { useRef, useState, useTransition } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { formatEnumLabel } from "@/lib/utils";
import { applyInlineEdit, approvePost, regeneratePost, updatePost } from "@/features/posts/actions";
import type { PostWithTopic } from "@/features/posts/queries";

type InlineAction = "rewrite" | "shorten" | "change_hook";

const APPROVABLE_STATUSES = new Set(["NEEDS_OWNER_REVIEW", "IN_EDIT"]);

const INLINE_ACTION_LABELS: Record<InlineAction, string> = {
  rewrite: "Rewrite selection",
  shorten: "Shorten selection",
  change_hook: "Change hook",
};

export function PostEditor({ post: initialPost }: { post: PostWithTopic }) {
  const [post, setPost] = useState(initialPost);
  const [finalText, setFinalText] = useState(initialPost.finalText ?? "");
  const [dirty, setDirty] = useState(false);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [regenerateDiff, setRegenerateDiff] = useState<{
    previousText: string | null;
  } | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  const [saving, startSaving] = useTransition();
  const [approving, startApproving] = useTransition();
  const [regenerating, startRegenerating] = useTransition();
  const [inlinePending, startInline] = useTransition();
  const [inlineAction, setInlineAction] = useState<InlineAction | null>(null);

  function handleSelect() {
    const el = textareaRef.current;
    if (!el) return;
    setSelection({ start: el.selectionStart, end: el.selectionEnd });
  }

  function handleSave() {
    startSaving(async () => {
      const result = await updatePost({ id: post.id, finalText });
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      setPost((prev) => ({ ...prev, ...result.data }));
      setDirty(false);
      setRegenerateDiff(null);
      toast.success("Saved");
    });
  }

  function handleApprove() {
    startApproving(async () => {
      const result = await approvePost(post.id);
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      setPost((prev) => ({ ...prev, ...result.data }));
      toast.success("Post approved");
    });
  }

  function handleRegenerate() {
    setConfirmRegenerate(false);
    startRegenerating(async () => {
      const result = await regeneratePost(post.id);
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      setPost((prev) => ({ ...prev, ...result.data.post }));
      setFinalText(result.data.post.finalText ?? "");
      setDirty(false);
      setRegenerateDiff({ previousText: result.data.previousText });
      toast.success("Post regenerated");
    });
  }

  function handleInlineAction(action: InlineAction) {
    const selectedText =
      action === "change_hook"
        ? (finalText.split("\n")[0] ?? "")
        : finalText.slice(selection.start, selection.end);
    if (!selectedText) return;

    setInlineAction(action);
    startInline(async () => {
      const result = await applyInlineEdit({
        postId: post.id,
        action,
        selectedText,
        contextText: finalText,
      });
      setInlineAction(null);
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }

      if (action === "change_hook") {
        const lines = finalText.split("\n");
        lines[0] = result.data.result;
        setFinalText(lines.join("\n"));
      } else {
        setFinalText(
          (prev) => prev.slice(0, selection.start) + result.data.result + prev.slice(selection.end),
        );
      }
      setDirty(true);
      toast.success("Applied — remember to Save");
    });
  }

  const hasSelection = selection.end > selection.start;
  const canApprove = APPROVABLE_STATUSES.has(post.status);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{post.topic?.title ?? "Untitled post"}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge>{formatEnumLabel(post.status)}</Badge>
          <Badge variant="outline">{formatEnumLabel(post.pillar)}</Badge>
          {post.qualityScore != null && (
            <Badge variant="secondary">Quality {post.qualityScore}/100</Badge>
          )}
          {post.grillCycles > 0 && (
            <Badge variant="secondary">
              {post.grillCycles} revision cycle{post.grillCycles === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
      </div>

      {post.status === "PIPELINE_RUNNING" ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6">
          <p className="text-sm font-medium">Generation appears interrupted.</p>
          <p className="text-sm text-muted-foreground">
            The pipeline was still running the last time this post was updated. Retry to generate a
            fresh draft.
          </p>
          <Button onClick={handleRegenerate} disabled={regenerating}>
            {regenerating ? "Generating..." : "Retry generation"}
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {(["rewrite", "shorten", "change_hook"] as const).map((action) => (
              <Button
                key={action}
                size="sm"
                variant="outline"
                disabled={(action !== "change_hook" && !hasSelection) || inlinePending}
                onClick={() => handleInlineAction(action)}
              >
                {inlineAction === action ? "Working..." : INLINE_ACTION_LABELS[action]}
              </Button>
            ))}
          </div>

          <Textarea
            ref={textareaRef}
            aria-label="Post draft"
            rows={16}
            value={finalText}
            onChange={(e) => {
              setFinalText(e.target.value);
              setDirty(true);
            }}
            onSelect={handleSelect}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleSave} disabled={saving || !dirty}>
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button variant="outline" onClick={() => setConfirmRegenerate(true)} disabled={regenerating}>
              {regenerating ? "Generating..." : "Regenerate"}
            </Button>
            <Button onClick={handleApprove} disabled={approving || !canApprove}>
              {approving ? "Approving..." : "Approve"}
            </Button>
          </div>
        </>
      )}

      {regenerateDiff && (
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <h2 className="text-sm font-medium">Regeneration result</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Previous</span>
              <p className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-sm">
                {regenerateDiff.previousText ?? "(empty)"}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">New</span>
              <p className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-sm">
                {finalText}
              </p>
            </div>
          </div>
        </div>
      )}

      <Dialog open={confirmRegenerate} onOpenChange={setConfirmRegenerate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate this post?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This replaces the current draft immediately. There is no undo — the previous text is only
            shown for comparison afterward, not restored automatically. This can take up to a minute.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRegenerate(false)}>
              Cancel
            </Button>
            <Button onClick={handleRegenerate}>Regenerate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
