import { timingSafeEqual } from "node:crypto";

// Constant-time equivalent of the `authHeader !== \`Bearer ${secret}\`` check both cron
// routes used previously — mirrors lib/publishing/signing.ts's verifySignature pattern.
export function isValidCronAuth(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!authHeader || !secret) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authHeader);
  if (expected.length !== actual.length) return false;

  return timingSafeEqual(expected, actual);
}
