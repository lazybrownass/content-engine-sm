import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { isOwnerEmail } from "@/lib/auth/session";

describe("isOwnerEmail", () => {
  const originalEnv = process.env.OWNER_EMAILS;

  afterEach(() => {
    process.env.OWNER_EMAILS = originalEnv;
  });

  beforeEach(() => {
    process.env.OWNER_EMAILS = "owner@example.com, Second@Example.com";
  });

  it("returns false for null/undefined", () => {
    expect(isOwnerEmail(null)).toBe(false);
    expect(isOwnerEmail(undefined)).toBe(false);
  });

  it("returns false when OWNER_EMAILS is unset", () => {
    delete process.env.OWNER_EMAILS;
    expect(isOwnerEmail("owner@example.com")).toBe(false);
  });

  it("matches an allow-listed email exactly", () => {
    expect(isOwnerEmail("owner@example.com")).toBe(true);
  });

  it("matches case-insensitively on both sides", () => {
    expect(isOwnerEmail("OWNER@EXAMPLE.COM")).toBe(true);
    expect(isOwnerEmail("second@example.com")).toBe(true);
  });

  it("rejects an email not in the allow-list", () => {
    expect(isOwnerEmail("someone-else@example.com")).toBe(false);
  });
});
