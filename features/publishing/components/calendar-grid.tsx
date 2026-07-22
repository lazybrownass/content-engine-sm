"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { AutomationProvider, Post } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dayKey } from "@/features/publishing/calendar";
import type { ScheduleWithPost } from "@/features/publishing/queries";

import { JobStatusBadge } from "./job-status-badge";
import { ScheduleDialog } from "./schedule-dialog";

const BROWSER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function CalendarGrid({
  days,
  view,
  schedulesByDay,
  schedulablePosts,
  providers,
}: {
  days: Date[];
  view: "week" | "month";
  schedulesByDay: Record<string, ScheduleWithPost[]>;
  schedulablePosts: Post[];
  providers: AutomationProvider[];
}) {
  const router = useRouter();
  const [dialogDate, setDialogDate] = useState<Date | null>(null);
  const todayKey = dayKey(new Date(), BROWSER_TIMEZONE);

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-7 gap-2">
        {days.map((day) => {
          const key = dayKey(day, BROWSER_TIMEZONE);
          const schedules = schedulesByDay[key] ?? [];
          const isToday = key === todayKey;

          return (
            <div
              key={key}
              className={`flex flex-col gap-1.5 rounded-lg border p-2 text-sm ${
                view === "month" ? "min-h-28" : "min-h-40"
              } ${isToday ? "border-primary/50 bg-primary/5" : "bg-card"}`}
            >
              <div className="flex items-center justify-between">
                <span className={`font-medium ${isToday ? "text-primary" : ""}`}>
                  {day.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  onClick={() => setDialogDate(day)}
                  aria-label="Schedule a post on this day"
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>

              <div className="flex flex-col gap-1">
                {schedules.map((schedule) => {
                  const latestJob = schedule.jobs[0];
                  return (
                    <div key={schedule.id} className="flex flex-col gap-0.5 rounded-md border bg-background p-1.5">
                      <span className="line-clamp-2 text-xs">
                        {schedule.post.finalText?.slice(0, 60) ?? "Untitled post"}
                      </span>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant="outline" className="text-[10px]">
                          {schedule.scheduledAt.toLocaleTimeString(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                            timeZone: schedule.timezone,
                          })}
                        </Badge>
                        {latestJob && <JobStatusBadge status={latestJob.status} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {dialogDate && (
        <ScheduleDialog
          key={dialogDate.toISOString()}
          open={dialogDate !== null}
          onOpenChange={(open) => !open && setDialogDate(null)}
          defaultDate={dialogDate}
          schedulablePosts={schedulablePosts}
          providers={providers}
          onScheduled={() => router.refresh()}
        />
      )}
    </div>
  );
}
