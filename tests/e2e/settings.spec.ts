import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { loginAsOwner } from "./helpers/auth";

test("redirects /settings to /login when unauthenticated", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login$/);
});

test.describe("authenticated settings", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
  });

  // Combined into one test (rather than two) to avoid a second magic-link round trip in the
  // same run — other spec files' repeated logins for the same OWNER_EMAIL already push close
  // to GoTrue's local rate limit (see schedule.spec.ts's comment on the same constraint).
  test("exports account data and has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export all data (JSON)" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^content-engine-export-\d{4}-\d{2}-\d{2}\.json$/);
  });
});
