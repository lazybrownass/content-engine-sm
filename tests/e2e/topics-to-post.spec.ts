import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { loginAsOwner } from "./helpers/auth";

test("redirects /topics to /login when unauthenticated", async ({ page }) => {
  await page.goto("/topics");
  await expect(page).toHaveURL(/\/login$/);
});

test("redirects /posts to /login when unauthenticated", async ({ page }) => {
  await page.goto("/posts");
  await expect(page).toHaveURL(/\/login$/);
});

test.describe("topics to approved post", () => {
  // Serial: both tests log in as the same single OWNER_EMAIL via a real magic-link round
  // trip (see helpers/auth.ts) — running them in parallel workers races two concurrent
  // logins against the same Mailpit inbox.
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
  });

  // E2E_MOCK_LLM swaps in the hand-rolled canned-response model (lib/ai/mock-generation-model.ts)
  // for every pipeline stage this flow touches (topic generation, outline, draft, grill review) —
  // ai/AGENTS.md 9.3 forbids asserting on real model output in CI.
  test("generate -> accept -> approve happy path", async ({ page }) => {
    await page.goto("/topics");

    await page.getByRole("button", { name: "Generate suggestions" }).click();
    await expect(page.getByText("Mock topic suggestion")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Accept" }).first().click();

    await expect(page).toHaveURL(/\/posts\/[^/]+\/edit$/, { timeout: 20_000 });
    await expect(
      page.getByText("This is a mock drafted post used only for deterministic E2E runs."),
    ).toBeVisible();
    await expect(page.getByText("Needs Owner Review")).toBeVisible();

    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Approved", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve" })).toBeDisabled();
  });

  test("has no automatically detectable accessibility violations on /topics, /posts, and the editor", async ({
    page,
  }) => {
    await page.goto("/topics");
    await expect(page.getByRole("heading", { name: "Topics", exact: true })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page.goto("/posts");
    await expect(page.getByRole("heading", { name: "Posts", exact: true })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    // Generate a real post so the editor route has something to render for its own check.
    await page.goto("/topics");
    await page.getByRole("button", { name: "Generate suggestions" }).click();
    await expect(page.getByText("Mock topic suggestion")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Accept" }).first().click();
    await expect(page).toHaveURL(/\/posts\/[^/]+\/edit$/, { timeout: 20_000 });
    // Past loading.tsx's skeleton (which has no heading) before auditing.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});
