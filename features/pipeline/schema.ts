import { z } from "zod";

export const outlineOutputSchema = z.object({
  sections: z
    .array(z.string().describe("One outline section/beat, a short phrase."))
    .min(2)
    .max(8),
});
export type OutlineOutput = z.infer<typeof outlineOutputSchema>;

export const draftOutputSchema = z.object({
  content: z.string().describe("Full drafted post content in the target brand voice."),
});
export type DraftOutput = z.infer<typeof draftOutputSchema>;

// "passed" is NOT part of this schema — it's a business rule (score >= threshold)
// computed locally in quality-review.ts, not something the model should decide.
export const grillModelOutputSchema = z.object({
  qualityScore: z.number().int().min(0).max(100),
  violations: z.array(z.string()).default([]),
});
export type GrillModelOutput = z.infer<typeof grillModelOutputSchema>;
