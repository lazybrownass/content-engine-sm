import { describe, expect, it } from "vitest";

import { checkDatabase, checkPgvector } from "@/lib/health/check-health";

describe("checkDatabase", () => {
  it("reports ok against the real test database", async () => {
    const result = await checkDatabase();
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });
});

describe("checkPgvector", () => {
  it("reports ok — the vector extension is installed by the init migration", async () => {
    const result = await checkPgvector();
    expect(result.ok).toBe(true);
  });
});
