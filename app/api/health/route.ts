import { NextResponse } from "next/server";

import {
  aggregateHealth,
  checkDatabase,
  checkPgvector,
  getModelRouterStatus,
} from "@/lib/health/check-health";

// AGENTS.md Rule 2 normally reserves Route Handlers for webhooks/cron/pipeline-tick,
// not general API endpoints. This is a narrow, explicitly-flagged exception: this is
// a live infrastructure probe that Docker/orchestrator tooling calls unauthenticated
// over plain HTTP — a Server Action can't be invoked that way. Closest in spirit to
// the allowed "pipeline status/tick" carve-out. See docs/06-Implementation-Plan.md's
// "Phase 6 (continued)" note.
export async function GET() {
  const [database, pgvector] = await Promise.all([checkDatabase(), checkPgvector()]);
  const report = aggregateHealth({ database, pgvector, modelRouter: getModelRouterStatus() });

  return NextResponse.json(report, { status: report.status === "ok" ? 200 : 503 });
}
