import { KnowledgeCategory, Pillar } from "@prisma/client";
import { z } from "zod";

export const pillarSchema = z.enum(Pillar);
export const knowledgeCategorySchema = z.enum(KnowledgeCategory);

export const createKnowledgeItemSchema = z.object({
  category: knowledgeCategorySchema,
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)).default([]),
  pillarHints: z.array(pillarSchema).default([]),
  sourceUrl: z.string().url().optional(),
});

export const updateKnowledgeItemSchema = createKnowledgeItemSchema.partial().extend({
  id: z.string().uuid(),
  archived: z.boolean().optional(),
});

export const queryKnowledgeItemsSchema = z.object({
  category: knowledgeCategorySchema.optional(),
  pillar: pillarSchema.optional(),
  archived: z.boolean().default(false),
  search: z.string().trim().min(1).optional(),
  limit: z.number().int().positive().max(100).default(20),
  cursor: z.string().uuid().optional(),
});

export type CreateKnowledgeItemInput = z.infer<typeof createKnowledgeItemSchema>;
export type UpdateKnowledgeItemInput = z.infer<typeof updateKnowledgeItemSchema>;
export type QueryKnowledgeItemsInput = z.infer<typeof queryKnowledgeItemsSchema>;
