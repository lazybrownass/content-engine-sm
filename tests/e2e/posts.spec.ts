import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { loginAsOwner } from "./helpers/auth";

test("redirects /posts to /login when unauthenticated", async ({ page }) => {
  await page.goto("/posts");
  await expect(page).toHaveURL(/\/login$/);
});

test.describe("authenticated posts", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
  });

  test("has no automatically detectable accessibility violations on /posts", async ({ page }) => {
    await page.goto("/posts");
    await expect(page.getByRole("heading", { name: "Posts", exact: true })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});
