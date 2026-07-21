import { NextResponse, type NextRequest } from "next/server";

import { processPendingKnowledgeChunks } from "@/lib/knowledge/embedding-pipeline";

// Safety net for the after()-scheduled fast path in features/knowledge/actions.ts: a large
// bulk import's embedding work can exceed the default serverless maxDuration before finishing,
// stranding chunks as 'pending' with nothing left to revisit them. This tick (every minute,
// see vercel.json) drains whatever's still pending.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processPendingKnowledgeChunks({ maxChunks: 100, timeBudgetMs: 50_000 });
  return NextResponse.json(result);
}
