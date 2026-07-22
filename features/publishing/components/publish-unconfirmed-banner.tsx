"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { resolvePublishUnconfirmed } from "@/features/publishing/actions";
import type { UnconfirmedJob } from "@/features/publishing/queries";

export function PublishUnconfirmedBanner({ jobs }: { jobs: UnconfirmedJob[] }) {
  const router = useRouter();
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  if (jobs.length === 0) return null;

  async function handleResolve(jobId: string, outcome: "published" | "failed") {
    setResolvingId(jobId);
    const result = await resolvePublishUnconfirmed({ jobId, outcome });
    setResolvingId(null);
    if (!result.success) {
      toast.error(result.error.message);
      return;
    }
    toast.success(outcome === "published" ? "Marked as published" : "Marked as failed");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <h2 className="text-sm font-medium text-destructive">
        Needs confirmation — no callback received in time
      </h2>
      <div className="flex flex-col gap-2">
        {jobs.map((job) => (
          <div
            key={job.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-2 text-sm"
          >
            <span className="line-clamp-1">{job.schedule.post.finalText ?? "Untitled post"}</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleResolve(job.id, "published")}
                disabled={resolvingId === job.id}
              >
                Confirm published
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleResolve(job.id, "failed")}
                disabled={resolvingId === job.id}
              >
                Mark failed
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
