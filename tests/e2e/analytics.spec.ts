import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { loginAsOwner } from "./helpers/auth";

test("redirects /analytics to /login when unauthenticated", async ({ page }) => {
  await page.goto("/analytics");
  await expect(page).toHaveURL(/\/login$/);
});

test.describe("authenticated analytics", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
  });

  test("has no automatically detectable accessibility violations on /analytics", async ({ page }) => {
    await page.goto("/analytics");
    await expect(page.getByRole("heading", { name: "Analytics", exact: true })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});
