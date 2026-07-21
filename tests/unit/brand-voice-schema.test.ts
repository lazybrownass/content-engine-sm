import { describe, expect, it } from "vitest";
import { createBrandVoiceSchema, updateBrandVoiceSchema } from "@/features/brand-voice/schema";

describe("createBrandVoiceSchema", () => {
  it("accepts a full valid payload", () => {
    const result = createBrandVoiceSchema.safeParse({
      name: "Confident Founder",
      tone: ["direct", "optimistic"],
      targetAudience: "Early-stage SaaS founders",
      forbiddenWords: ["synergy", "leverage"],
      signatureHooks: ["Here's what nobody tells you about..."],
      formattingRules: ["short paragraphs", "no emoji"],
      isDefault: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a minimal payload and defaults arrays to [] and isDefault to false", () => {
    const result = createBrandVoiceSchema.safeParse({ name: "Plain" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tone).toEqual([]);
      expect(result.data.forbiddenWords).toEqual([]);
      expect(result.data.signatureHooks).toEqual([]);
      expect(result.data.formattingRules).toEqual([]);
      expect(result.data.isDefault).toBe(false);
    }
  });

  it("rejects a missing name", () => {
    const result = createBrandVoiceSchema.safeParse({ tone: ["direct"] });
    expect(result.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const result = createBrandVoiceSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a name over 120 characters", () => {
    const result = createBrandVoiceSchema.safeParse({ name: "a".repeat(121) });
    expect(result.success).toBe(false);
  });
});

describe("updateBrandVoiceSchema", () => {
  it("accepts a partial payload with just id and one field", () => {
    const result = updateBrandVoiceSchema.safeParse({
      id: "123e4567-e89b-12d3-a456-426614174000",
      name: "Renamed",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid id", () => {
    const result = updateBrandVoiceSchema.safeParse({ id: "not-a-uuid", name: "Renamed" });
    expect(result.success).toBe(false);
  });
});
