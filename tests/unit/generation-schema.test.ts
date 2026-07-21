import { describe, expect, it } from "vitest";
import { generateRequestSchema, generationOutputSchema } from "@/features/generation/schema";

describe("generateRequestSchema", () => {
  it("accepts a prompt without a brandVoiceId", () => {
    const result = generateRequestSchema.safeParse({ prompt: "Write about our Q3 launch" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty prompt", () => {
    const result = generateRequestSchema.safeParse({ prompt: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid brandVoiceId", () => {
    const result = generateRequestSchema.safeParse({ prompt: "Topic", brandVoiceId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects a prompt over 2000 characters", () => {
    const result = generateRequestSchema.safeParse({ prompt: "a".repeat(2001) });
    expect(result.success).toBe(false);
  });
});

describe("generationOutputSchema", () => {
  it("accepts a well-formed generation output regardless of length", () => {
    const result = generationOutputSchema.safeParse({
      hook: "a".repeat(200),
      linkedInPost: "A full post.",
      tweetThread: ["a".repeat(400)],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty tweetThread array", () => {
    const result = generationOutputSchema.safeParse({
      hook: "Hook",
      linkedInPost: "Post",
      tweetThread: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing linkedInPost", () => {
    const result = generationOutputSchema.safeParse({
      hook: "Hook",
      tweetThread: ["Tweet"],
    });
    expect(result.success).toBe(false);
  });
});
