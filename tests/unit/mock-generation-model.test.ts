import { describe, expect, it } from "vitest";

import { createMockGenerationModel } from "@/lib/ai/mock-generation-model";
import {
  draftOutputSchema,
  grillModelOutputSchema,
  inlineEditOutputSchema,
  outlineOutputSchema,
  topicGenerationOutputSchema,
} from "@/features/pipeline/schema";

// generateObject() (used by every features/pipeline stage) calls doGenerate(), not
// doStream() — this locks in that the combined mock payload satisfies every pipeline
// stage's Zod schema simultaneously, so E2E_MOCK_LLM works for the full topic/post flow.
describe("createMockGenerationModel doGenerate", () => {
  it("returns a payload that satisfies every pipeline stage's output schema", async () => {
    const model = createMockGenerationModel();
    const result = await model.doGenerate({} as never);
    const text = result.content.find((part) => part.type === "text")?.text;
    expect(text).toBeTruthy();

    const parsed: unknown = JSON.parse(text!);

    expect(outlineOutputSchema.safeParse(parsed).success).toBe(true);
    expect(draftOutputSchema.safeParse(parsed).success).toBe(true);
    expect(grillModelOutputSchema.safeParse(parsed).success).toBe(true);
    expect(topicGenerationOutputSchema.safeParse(parsed).success).toBe(true);
    expect(inlineEditOutputSchema.safeParse(parsed).success).toBe(true);
  });
});
