import { test, expect } from "@playwright/test";

import { loginAsOwner } from "./helpers/auth";

test("redirects /knowledge to /login when unauthenticated", async ({ page }) => {
  await page.goto("/knowledge");
  await expect(page).toHaveURL(/\/login$/);
});

test.describe("authenticated search", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
  });

  test("searching updates the URL and renders the no-results empty state", async ({ page }) => {
    const query = "nonexistent-search-term-e2e-test";

    await page.goto("/knowledge");
    await page.getByLabel("Search").fill(query);
    await page.getByRole("button", { name: "Apply" }).click();

    await expect(page).toHaveURL(new RegExp(`[?&]q=${query}`));

    const heading = page.getByRole("heading", { name: /No results for/ });
    await expect(heading).toBeVisible();
    await expect(heading).toContainText(query);
    await expect(page.getByRole("link", { name: "Clear search" })).toBeVisible();
  });
});
