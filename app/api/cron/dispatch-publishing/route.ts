import { NextResponse, type NextRequest } from "next/server";

import { dispatchDuePublishingJobs, sweepUnconfirmedPublishingJobs } from "@/lib/publishing/dispatch-due-jobs";

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dispatchResult = await dispatchDuePublishingJobs();
  const sweepResult = await sweepUnconfirmedPublishingJobs();
  return NextResponse.json({ ...dispatchResult, ...sweepResult });
}
