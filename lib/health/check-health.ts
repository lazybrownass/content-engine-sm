import { prisma } from "@/lib/db/prisma";

export interface CheckResult {
  ok: boolean;
  error?: string;
}

export interface ModelRouterStatus {
  provider: "mock" | "ollama" | "huggingface";
  configured: boolean;
}

export interface HealthChecks {
  database: CheckResult;
  pgvector: CheckResult;
  modelRouter: ModelRouterStatus;
}

export interface HealthReport {
  status: "ok" | "degraded";
  checks: HealthChecks;
  timestamp: string;
}

export async function checkDatabase(): Promise<CheckResult> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// Verifies the vector extension is actually installed and queryable in the
// connected database, not just declared in prisma/schema.prisma's datasource
// extensions list — a migration can be skipped or fail independently of the
// schema file. Same prisma.$queryRaw convention as lib/knowledge/search.ts.
export async function checkPgvector(): Promise<CheckResult> {
  try {
    const rows = await prisma.$queryRaw<{ extname: string; extversion: string }[]>`
      SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'
    `;
    return rows.length > 0 ? { ok: true } : { ok: false, error: "vector extension not installed" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// Reports which provider lib/ai/model-router.ts's getModel() would currently
// select and whether its required config is present — a configuration check,
// not a live network probe. Per PRD §9, a slow/unreachable third-party model
// provider must never fail the app's own health check.
export function getModelRouterStatus(): ModelRouterStatus {
  if (process.env.E2E_MOCK_LLM) {
    return { provider: "mock", configured: true };
  }
  if (process.env.MODEL_PROVIDER === "ollama") {
    return { provider: "ollama", configured: true }; // OLLAMA_BASE_URL defaults if unset
  }
  return { provider: "huggingface", configured: Boolean(process.env.HUGGINGFACE_API_TOKEN) };
}

// Database unreachable is the only thing that flips overall status to
// "degraded" (and the route's HTTP status to 503) — pgvector missing is
// reported but doesn't alone fail the check, since parts of the app not
// touching vector search still function; modelRouter is informational only.
export function aggregateHealth(checks: HealthChecks): HealthReport {
  return {
    status: checks.database.ok ? "ok" : "degraded",
    checks,
    timestamp: new Date().toISOString(),
  };
}
