import { NextResponse, type NextRequest } from "next/server";

import { dispatchDuePublishingJobs, sweepUnconfirmedPublishingJobs } from "@/lib/publishing/dispatch-due-jobs";
import { isValidCronAuth } from "@/lib/security/cron-auth";
import { getClientIp, isRateLimited } from "@/lib/security/rate-limit";

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  if (isRateLimited(`cron:${getClientIp(request)}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const authHeader = request.headers.get("authorization");
  if (!isValidCronAuth(authHeader)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dispatchResult = await dispatchDuePublishingJobs();
  const sweepResult = await sweepUnconfirmedPublishingJobs();
  return NextResponse.json({ ...dispatchResult, ...sweepResult });
}
