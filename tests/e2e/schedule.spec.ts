import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { loginAsOwner } from "./helpers/auth";

function readEnvVar(name: string): string {
  const envFile = readFileSync(path.resolve(process.cwd(), ".env"), "utf-8");
  const match = envFile.match(new RegExp(`^${name}=(.*)$`, "m"));
  if (!match?.[1]) throw new Error(`${name} not set in .env`);
  return match[1].trim();
}

test("redirects /schedule to /login when unauthenticated", async ({ page }) => {
  await page.goto("/schedule");
  await expect(page).toHaveURL(/\/login$/);
});

test.describe("schedule a post via the Manual provider", () => {
  // Serial: both tests log in as the same single OWNER_EMAIL via a real magic-link round
  // trip (see helpers/auth.ts) — running them in parallel workers races two concurrent
  // logins against the same Mailpit inbox.
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
  });

  test("schedule -> force-dispatch -> copy -> mark published happy path", async ({
    page,
    request,
    context,
  }) => {
    await context.grantPermissions(["clipboard-write"], { origin: "http://localhost:3000" });

    // Produce one APPROVED post via the same mock-LLM pipeline as topics-to-post.spec.ts.
    await page.goto("/topics");
    await page.getByRole("button", { name: "Generate suggestions" }).click();
    await expect(page.getByText("Mock topic suggestion")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Accept" }).first().click();
    await expect(page).toHaveURL(/\/posts\/[^/]+\/edit$/, { timeout: 20_000 });
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Approved", { exact: true })).toBeVisible();

    // Schedule that post today via the Manual provider (the dialog's default date/time is
    // today at midnight, already in the past — so the cron dispatch below finds it immediately).
    await page.goto("/schedule");
    await page.getByRole("button", { name: "Schedule a post on this day" }).first().click();

    await page.getByRole("combobox", { name: "Post" }).click();
    await page.getByRole("option", { name: /mock drafted post/i }).click();

    await page.getByRole("combobox", { name: "Automation provider" }).click();
    await page.getByRole("option", { name: /^Manual/ }).click();

    await page.getByRole("button", { name: "Schedule" }).click();
    await expect(page.getByText("Scheduled", { exact: true })).toBeVisible();

    // Force the cron tick that would otherwise run every 5 minutes on Vercel.
    const cronSecret = readEnvVar("CRON_SECRET");
    const dispatchResponse = await request.get("/api/cron/dispatch-publishing", {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    expect(dispatchResponse.ok()).toBe(true);
    expect((await dispatchResponse.json()).dispatched).toBeGreaterThanOrEqual(1);

    // Manual dispatch is synchronous DISPATCHED — the post now needs the owner to
    // copy/publish it by hand and confirm.
    await page.goto("/schedule");
    await expect(page.getByRole("heading", { name: "Ready to publish manually" })).toBeVisible();

    await page.getByRole("button", { name: "Copy text" }).click();
    await expect(page.getByText("Copied to clipboard")).toBeVisible();

    await page.getByRole("button", { name: "Mark published" }).click();
    await expect(page.getByText("Marked as published")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ready to publish manually" })).toHaveCount(0);
  });

  test("has no automatically detectable accessibility violations on /schedule", async ({ page }) => {
    await page.goto("/schedule");
    await expect(page.getByRole("heading", { name: "Schedule", exact: true })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});
