import type { Page } from "@playwright/test";

const MAILPIT_URL = "http://127.0.0.1:54324";
const MAGIC_LINK_TIMEOUT_MS = 15_000;

export const OWNER_EMAIL = "owner@example.com";

interface MailpitMessageSummary {
  ID: string;
  To: { Address: string }[];
  Created: string;
}

interface MailpitMessageDetail {
  HTML?: string;
  Text?: string;
}

// Polls Mailpit's REST API (the local Docker stack's SMTP catcher) for the magic-link email,
// guarding against a stale message from an earlier run by requiring Created >= sentAfter —
// GoTrue's magic-link tokens are single-use, so picking up an old message would fail silently
// with a confusing "code exchange failed" error instead of a clear "no email arrived" one.
async function waitForMagicLink(email: string, sentAfter: number): Promise<string> {
  const deadline = Date.now() + MAGIC_LINK_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const listResponse = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=10`);
    const list = (await listResponse.json()) as { messages: MailpitMessageSummary[] };

    const match = list.messages.find(
      (message) =>
        message.To?.[0]?.Address === email &&
        new Date(message.Created).getTime() >= sentAfter,
    );

    if (match) {
      const detailResponse = await fetch(`${MAILPIT_URL}/api/v1/message/${match.ID}`);
      const detail = (await detailResponse.json()) as MailpitMessageDetail;
      const body = detail.HTML ?? detail.Text ?? "";
      const linkMatch = body.match(/href="([^"]*\/auth\/v1\/verify[^"]*)"/);
      if (linkMatch) return linkMatch[1]!.replace(/&amp;/g, "&");
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`No magic-link email arrived for ${email} within ${MAGIC_LINK_TIMEOUT_MS}ms`);
}

// Logs in as the owner via a real magic-link round trip through the local Docker Supabase
// stack. Must run in a single page/context throughout: signInWithOtp() stores a PKCE
// code_verifier in cookies, which /auth/callback's exchangeCodeForSession() needs when the
// magic link is followed — a fresh browser context would not have that cookie.
export async function loginAsOwner(page: Page): Promise<void> {
  const sentAfter = Date.now();

  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByRole("button", { name: "Send magic link" }).click();
  await page.getByRole("status").waitFor();

  const magicLinkUrl = await waitForMagicLink(OWNER_EMAIL, sentAfter);
  await page.goto(magicLinkUrl);

  await page.waitForURL(/\/dashboard$/);
}
