import { publishingProviders } from "@/features/publishing/providers/registry";
import { prisma } from "@/lib/db/prisma";

const DEFAULT_MAX_JOBS = 20;
const DEFAULT_TIME_BUDGET_MS = 20_000;
const DEFAULT_CALLBACK_TIMEOUT_MINUTES = 30;

export interface DispatchDueJobsResult {
  dispatched: number;
  failed: number;
}

// Mirrors lib/knowledge/embedding-pipeline.ts's processPendingKnowledgeChunks batch/time-budget
// loop shape. Runs under the Supabase service-role key (bypasses RLS), so per AGENTS.md §7.5
// every job's post-owner/provider-owner pair is verified before acting.
export async function dispatchDuePublishingJobs(
  options: { maxJobs?: number; timeBudgetMs?: number } = {},
): Promise<DispatchDueJobsResult> {
  const maxJobs = options.maxJobs ?? DEFAULT_MAX_JOBS;
  const timeBudgetMs = options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;
  const startedAt = Date.now();

  let dispatched = 0;
  let failed = 0;

  while (dispatched + failed < maxJobs) {
    if (Date.now() - startedAt > timeBudgetMs) break;

    const job = await prisma.publishingJob.findFirst({
      where: { status: "SCHEDULED", schedule: { scheduledAt: { lte: new Date() } } },
      orderBy: { schedule: { scheduledAt: "asc" } },
      include: { schedule: { include: { post: true } }, automationProvider: true },
    });
    if (!job) break;

    if (job.schedule.post.ownerId !== job.automationProvider.ownerId) {
      await prisma.publishingJob.update({
        where: { id: job.id },
        data: { status: "FAILED", errorMessage: "Post owner and automation provider owner do not match" },
      });
      await prisma.post.update({ where: { id: job.schedule.postId }, data: { status: "FAILED" } });
      failed++;
      continue;
    }

    const provider = publishingProviders[job.automationProvider.type];
    const result = await provider.dispatch({
      job,
      schedule: job.schedule,
      post: job.schedule.post,
      automationProvider: job.automationProvider,
    });

    if (result.status === "DISPATCHED") {
      await prisma.publishingJob.update({
        where: { id: job.id },
        data: { status: "DISPATCHED", dispatchedAt: new Date() },
      });
      await prisma.post.update({ where: { id: job.schedule.postId }, data: { status: "PUBLISHING" } });
      dispatched++;
    } else {
      await prisma.publishingJob.update({
        where: { id: job.id },
        data: { status: "FAILED", errorMessage: result.errorMessage },
      });
      await prisma.post.update({ where: { id: job.schedule.postId }, data: { status: "FAILED" } });
      failed++;
    }
  }

  return { dispatched, failed };
}

export interface SweepUnconfirmedResult {
  swept: number;
}

// The entire publish_unconfirmed timeout mechanism: no in-process scheduler exists, so a
// DISPATCHED job whose callback hasn't arrived within PUBLISHING_CALLBACK_TIMEOUT_MINUTES gets
// flipped every cron tick. MANUAL is never swept — it has no async callback to wait for at all.
export async function sweepUnconfirmedPublishingJobs(): Promise<SweepUnconfirmedResult> {
  const timeoutMinutes = Number(
    process.env.PUBLISHING_CALLBACK_TIMEOUT_MINUTES ?? DEFAULT_CALLBACK_TIMEOUT_MINUTES,
  );
  const cutoff = new Date(Date.now() - timeoutMinutes * 60_000);

  const stale = await prisma.publishingJob.findMany({
    where: {
      status: "DISPATCHED",
      dispatchedAt: { lte: cutoff },
      automationProvider: { type: { in: ["N8N", "MAKE"] } },
    },
    include: { schedule: true },
  });

  for (const job of stale) {
    await prisma.publishingJob.update({ where: { id: job.id }, data: { status: "PUBLISH_UNCONFIRMED" } });
    await prisma.post.update({ where: { id: job.schedule.postId }, data: { status: "PUBLISH_UNCONFIRMED" } });
  }

  return { swept: stale.length };
}
