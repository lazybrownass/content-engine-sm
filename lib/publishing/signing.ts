import { createHmac, timingSafeEqual } from "node:crypto";

export function signPayload(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifySignature(
  body: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader) return false;

  const expected = Buffer.from(signPayload(body, secret), "hex");
  const actual = Buffer.from(signatureHeader, "hex");
  // Length check must happen before timingSafeEqual, which throws on mismatched lengths.
  if (expected.length !== actual.length) return false;

  return timingSafeEqual(expected, actual);
}
