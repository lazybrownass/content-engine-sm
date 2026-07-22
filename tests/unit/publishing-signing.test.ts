import { describe, expect, it } from "vitest";
import { signPayload, verifySignature } from "@/lib/publishing/signing";

describe("signPayload / verifySignature", () => {
  const secret = "test-secret";
  const body = JSON.stringify({ jobId: "abc-123", status: "success" });

  it("round-trips: a signature produced by signPayload verifies successfully", () => {
    const signature = signPayload(body, secret);
    expect(verifySignature(body, signature, secret)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const signature = signPayload(body, secret);
    const tamperedBody = JSON.stringify({ jobId: "abc-123", status: "failed" });
    expect(verifySignature(tamperedBody, signature, secret)).toBe(false);
  });

  it("rejects a signature produced with the wrong secret", () => {
    const signature = signPayload(body, "wrong-secret");
    expect(verifySignature(body, signature, secret)).toBe(false);
  });

  it("rejects a signature of a different length without throwing", () => {
    expect(verifySignature(body, "deadbeef", secret)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifySignature(body, null, secret)).toBe(false);
  });
});
