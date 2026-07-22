"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { AutomationProvider, Post } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatEnumLabel } from "@/lib/utils";
import { schedulePost } from "@/features/publishing/actions";

const TIMEZONES = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"];
const DEFAULT_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ScheduleDialog({
  open,
  onOpenChange,
  defaultDate,
  schedulablePosts,
  providers,
  onScheduled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate: Date;
  schedulablePosts: Post[];
  providers: AutomationProvider[];
  onScheduled: () => void;
}) {
  const [postId, setPostId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [scheduledAt, setScheduledAt] = useState(() => toDatetimeLocalValue(defaultDate));
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [pending, startTransition] = useTransition();

  function handleSchedule() {
    if (!postId || !providerId || !scheduledAt) return;
    startTransition(async () => {
      const result = await schedulePost({
        postId,
        automationProviderId: providerId,
        scheduledAt: new Date(scheduledAt).toISOString(),
        timezone,
      });
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Post scheduled");
      onOpenChange(false);
      onScheduled();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule a post</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="schedule-post">
              Post
            </label>
            <Select value={postId} onValueChange={(value) => setPostId(value ?? "")}>
              <SelectTrigger id="schedule-post" className="w-full">
                <SelectValue placeholder="Choose an approved post" />
              </SelectTrigger>
              <SelectContent>
                {schedulablePosts.map((post) => (
                  <SelectItem key={post.id} value={post.id}>
                    {post.finalText ? post.finalText.slice(0, 60) : `Post ${post.id.slice(0, 8)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {schedulablePosts.length === 0 && (
              <p className="text-xs text-muted-foreground">No approved posts are available to schedule yet.</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="schedule-when">
              Date &amp; time
            </label>
            <input
              id="schedule-when"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="schedule-timezone">
              Timezone
            </label>
            <select
              id="schedule-timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="schedule-provider">
              Automation provider
            </label>
            <Select value={providerId} onValueChange={(value) => setProviderId(value ?? "")}>
              <SelectTrigger id="schedule-provider" className="w-full">
                <SelectValue placeholder="Choose a provider" />
              </SelectTrigger>
              <SelectContent>
                {providers.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.label} ({formatEnumLabel(provider.type)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSchedule} disabled={pending || !postId || !providerId}>
            {pending ? "Scheduling..." : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
