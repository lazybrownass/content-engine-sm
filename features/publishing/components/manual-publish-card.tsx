"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmManualPublish } from "@/features/publishing/actions";
import type { ScheduleWithPost } from "@/features/publishing/queries";

export function ManualPublishCard({ schedules }: { schedules: ScheduleWithPost[] }) {
  const router = useRouter();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  if (schedules.length === 0) return null;

  async function handleConfirm(jobId: string) {
    setConfirmingId(jobId);
    const result = await confirmManualPublish({ jobId, linkedinUrl: urls[jobId] || undefined });
    setConfirmingId(null);
    if (!result.success) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Marked as published");
    router.refresh();
  }

  async function handleCopy(text: string | null) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="text-sm font-medium">Ready to publish manually</h2>
      <div className="flex flex-col gap-3">
        {schedules.map((schedule) => {
          const job = schedule.jobs[0];
          if (!job) return null;
          return (
            <div key={schedule.id} className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-sm">
              <p className="line-clamp-3 whitespace-pre-wrap text-muted-foreground">
                {schedule.post.finalText ?? "No draft content."}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => handleCopy(schedule.post.finalText)}>
                  Copy text
                </Button>
                <Input
                  placeholder="LinkedIn post URL (optional)"
                  className="max-w-xs"
                  value={urls[job.id] ?? ""}
                  onChange={(e) => setUrls((prev) => ({ ...prev, [job.id]: e.target.value }))}
                />
                <Button size="sm" onClick={() => handleConfirm(job.id)} disabled={confirmingId === job.id}>
                  {confirmingId === job.id ? "Marking..." : "Mark published"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
