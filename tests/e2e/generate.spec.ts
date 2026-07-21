import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { loginAsOwner } from "./helpers/auth";

test("redirects /generate to /login when unauthenticated", async ({ page }) => {
  await page.goto("/generate");
  await expect(page).toHaveURL(/\/login$/);
});

test.describe("authenticated generation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
  });

  // E2E_MOCK_LLM swaps in a hand-rolled canned-response model (lib/ai/mock-generation-model.ts)
  // so this never depends on a real HuggingFace call — ai/AGENTS.md 9.3 forbids asserting on
  // real model output in CI.
  test("generating from a prompt streams LinkedIn, X thread, and hook tabs", async ({ page }) => {
    await page.goto("/generate");

    await expect(page.getByLabel("Topic")).toBeVisible();
    await expect(page.getByLabel("Brand voice")).toBeVisible();

    await page.getByLabel("Topic").fill("Our Q3 product launch");
    await page.getByRole("button", { name: "Generate" }).click();

    await expect(page.getByRole("tab", { name: "LinkedIn" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("mock LinkedIn post")).toBeVisible();

    await page.getByRole("tab", { name: "X Thread" }).click();
    await expect(page.getByText("Mock tweet one.")).toBeVisible();

    await page.getByRole("tab", { name: "Hook" }).click();
    await expect(page.getByText("mock hook")).toBeVisible();
  });

  test("has no automatically detectable accessibility violations", async ({ page }) => {
    await page.goto("/generate");
    await expect(page.getByLabel("Topic")).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
