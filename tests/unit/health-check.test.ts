import { describe, expect, it } from "vitest";

import { aggregateHealth, type HealthChecks } from "@/lib/health/check-health";

function makeChecks(overrides: Partial<HealthChecks> = {}): HealthChecks {
  return {
    database: { ok: true },
    pgvector: { ok: true },
    modelRouter: { provider: "huggingface", configured: true },
    ...overrides,
  };
}

describe("aggregateHealth", () => {
  it("reports ok when database and pgvector are both healthy", () => {
    const report = aggregateHealth(makeChecks());
    expect(report.status).toBe("ok");
    expect(report.checks.database.ok).toBe(true);
    expect(report.checks.pgvector.ok).toBe(true);
  });

  it("reports degraded when the database is unreachable", () => {
    const report = aggregateHealth(makeChecks({ database: { ok: false, error: "connect ECONNREFUSED" } }));
    expect(report.status).toBe("degraded");
  });

  it("stays ok when only pgvector is missing — database is what gates status", () => {
    const report = aggregateHealth(makeChecks({ pgvector: { ok: false, error: "vector extension not installed" } }));
    expect(report.status).toBe("ok");
    expect(report.checks.pgvector.ok).toBe(false);
  });

  it("never lets modelRouter configuration affect overall status", () => {
    const report = aggregateHealth(makeChecks({ modelRouter: { provider: "huggingface", configured: false } }));
    expect(report.status).toBe("ok");
    expect(report.checks.modelRouter.configured).toBe(false);
  });

  it("includes an ISO timestamp", () => {
    const report = aggregateHealth(makeChecks());
    expect(() => new Date(report.timestamp).toISOString()).not.toThrow();
  });
});
