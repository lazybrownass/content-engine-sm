import { test, expect } from "@playwright/test";

// Full login -> dashboard -> logout requires a live Supabase Auth backend
// (not available in CI's plain Postgres service). This covers the
// unauthenticated half of that flow: the middleware's owner allow-list gate.
test.describe("unauthenticated access", () => {
  test("redirects the home page to /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("redirects /dashboard to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("serves /login directly without redirecting", async ({ page }) => {
    const response = await page.goto("/login");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/login$/);
  });
});
