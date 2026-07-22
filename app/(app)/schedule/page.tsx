import Link from "next/link";

import {
  addDays,
  addMonths,
  dayKey,
  formatAnchorDate,
  getMonthGridDays,
  getWeekDays,
  parseAnchorDate,
} from "@/features/publishing/calendar";
import { CalendarGrid } from "@/features/publishing/components/calendar-grid";
import { ManualPublishCard } from "@/features/publishing/components/manual-publish-card";
import { ProviderSetupForm } from "@/features/publishing/components/provider-setup-form";
import { PublishUnconfirmedBanner } from "@/features/publishing/components/publish-unconfirmed-banner";
import {
  getAutomationProviders,
  getSchedulableApprovedPosts,
  getSchedulesForRange,
  getUnconfirmedJobs,
  type ScheduleWithPost,
} from "@/features/publishing/queries";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const get = (key: string): string | undefined => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const view = get("view") === "month" ? "month" : "week";
  const anchor = parseAnchorDate(get("anchor"));

  const days = view === "month" ? getMonthGridDays(anchor) : getWeekDays(anchor);
  const rangeStart = days[0];
  const rangeEnd = addDays(days[days.length - 1], 1);

  const [schedules, unconfirmedJobs, schedulablePosts, providers] = await Promise.all([
    getSchedulesForRange(rangeStart, rangeEnd),
    getUnconfirmedJobs(),
    getSchedulableApprovedPosts(),
    getAutomationProviders(),
  ]);

  const schedulesByDay: Record<string, ScheduleWithPost[]> = {};
  for (const schedule of schedules) {
    const key = dayKey(schedule.scheduledAt, schedule.timezone);
    (schedulesByDay[key] ??= []).push(schedule);
  }

  const manualPendingSchedules = schedules.filter((schedule) => {
    const latestJob = schedule.jobs[0];
    return latestJob?.status === "DISPATCHED" && latestJob.automationProvider.type === "MANUAL";
  });

  const prevAnchor = view === "month" ? addMonths(anchor, -1) : addDays(anchor, -7);
  const nextAnchor = view === "month" ? addMonths(anchor, 1) : addDays(anchor, 7);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Schedule</h1>
          <p className="text-sm text-muted-foreground">
            Schedule approved posts for automated or manual publishing.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={`?view=${view}&anchor=${formatAnchorDate(prevAnchor)}`}
            className="rounded-lg border px-3 py-1.5 hover:bg-muted"
          >
            Previous
          </Link>
          <Link
            href={`?view=${view}&anchor=${formatAnchorDate(new Date())}`}
            className="rounded-lg border px-3 py-1.5 hover:bg-muted"
          >
            Today
          </Link>
          <Link
            href={`?view=${view}&anchor=${formatAnchorDate(nextAnchor)}`}
            className="rounded-lg border px-3 py-1.5 hover:bg-muted"
          >
            Next
          </Link>
          <div className="ml-2 flex gap-1 rounded-lg border p-1">
            <Link
              href={`?view=week&anchor=${formatAnchorDate(anchor)}`}
              className={`rounded-md px-2 py-1 ${view === "week" ? "bg-muted font-medium" : ""}`}
            >
              Week
            </Link>
            <Link
              href={`?view=month&anchor=${formatAnchorDate(anchor)}`}
              className={`rounded-md px-2 py-1 ${view === "month" ? "bg-muted font-medium" : ""}`}
            >
              Month
            </Link>
          </div>
        </div>
      </div>

      <PublishUnconfirmedBanner jobs={unconfirmedJobs} />
      <ProviderSetupForm providers={providers} />
      <CalendarGrid
        days={days}
        view={view}
        schedulesByDay={schedulesByDay}
        schedulablePosts={schedulablePosts}
        providers={providers}
      />
      <ManualPublishCard schedules={manualPendingSchedules} />
    </div>
  );
}
