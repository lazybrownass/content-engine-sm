import { describe, expect, it } from "vitest";
import type { AutomationProvider } from "@prisma/client";

import { manualProvider } from "@/features/publishing/providers/manual.provider";
import { publishingProviders } from "@/features/publishing/providers/registry";

describe("manualProvider", () => {
  it("dispatch() always succeeds with no external call", async () => {
    const result = await manualProvider.dispatch(
      {} as Parameters<typeof manualProvider.dispatch>[0],
    );
    expect(result).toEqual({ status: "DISPATCHED" });
  });

  it("ping() always succeeds", async () => {
    const result = await manualProvider.ping({} as AutomationProvider);
    expect(result).toEqual({ ok: true });
  });
});

describe("publishingProviders registry", () => {
  it("has an entry for MANUAL, N8N, and MAKE with matching type field", () => {
    expect(publishingProviders.MANUAL.type).toBe("MANUAL");
    expect(publishingProviders.N8N.type).toBe("N8N");
    expect(publishingProviders.MAKE.type).toBe("MAKE");
  });
});
