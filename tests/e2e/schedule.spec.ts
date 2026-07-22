import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";

import { loginAsOwner, OWNER_EMAIL } from "./helpers/auth";

const prisma = new PrismaClient();

// CI injects CRON_SECRET directly into process.env (no root .env file exists there); local
// dev keeps it in .env, which the Playwright test process (unlike the Next.js webServer it
// spawns) does not auto-load — so fall back to reading the file only when running locally.
function readEnvVar(name: string): string {
  if (process.env[name]) return process.env[name]!;
  try {
    const envFile = readFileSync(path.resolve(process.cwd(), ".env"), "utf-8");
    const match = envFile.match(new RegExp(`^${name}=(.*)$`, "m"));
    if (match?.[1]) return match[1].trim();
  } catch {
    // no local .env file — fall through to the error below
  }
  throw new Error(`${name} not set in process.env or .env`);
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

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("schedule -> force-dispatch -> copy -> mark published happy path", async ({
    page,
    request,
    context,
  }) => {
    await context.grantPermissions(["clipboard-write"], { origin: "http://localhost:3000" });

    // Seed the APPROVED post directly rather than through /topics' "Generate suggestions" —
    // this test is about scheduling, not topic generation (already covered by
    // topics-to-post.spec.ts), and going through that shared UI flow would add another
    // "Mock topic suggestion" topic under the same shared OWNER_EMAIL account other spec
    // files also drive, causing cross-file strict-mode collisions on that fixed title.
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: OWNER_EMAIL } });
    const marker = `E2E schedule test post ${randomUUID().slice(0, 8)}`;
    const post = await prisma.post.create({
      data: { ownerId: owner.id, pillar: "CASE_STUDY", status: "APPROVED", finalText: marker },
    });

    // Schedule that post today via the Manual provider (the dialog's default date/time is
    // today at midnight, already in the past — so the cron dispatch below finds it immediately).
    await page.goto("/schedule");
    await page.getByRole("button", { name: "Schedule a post on this day" }).first().click();

    await page.getByRole("combobox", { name: "Post" }).click();
    await page.getByRole("option", { name: marker }).click();

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

    await prisma.post.delete({ where: { id: post.id } }).catch(() => {});
  });

  test("has no automatically detectable accessibility violations on /schedule", async ({ page }) => {
    await page.goto("/schedule");
    await expect(page.getByRole("heading", { name: "Schedule", exact: true })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});
