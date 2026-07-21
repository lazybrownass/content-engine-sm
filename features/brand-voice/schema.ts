import { z } from "zod";

export const createBrandVoiceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  tone: z.array(z.string().trim().min(1)).default([]),
  targetAudience: z.string().trim().max(500).optional(),
  forbiddenWords: z.array(z.string().trim().min(1)).default([]),
  signatureHooks: z.array(z.string().trim().min(1)).default([]),
  formattingRules: z.array(z.string().trim().min(1)).default([]),
  isDefault: z.boolean().default(false),
});

export const updateBrandVoiceSchema = createBrandVoiceSchema.partial().extend({
  id: z.string().uuid(),
});

export const setDefaultBrandVoiceSchema = z.string().uuid();

export type CreateBrandVoiceInput = z.infer<typeof createBrandVoiceSchema>;
export type UpdateBrandVoiceInput = z.infer<typeof updateBrandVoiceSchema>;
