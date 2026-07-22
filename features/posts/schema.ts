import { Pillar, PostStatus } from "@prisma/client";
import { z } from "zod";

export const pillarSchema = z.enum(Pillar);
export const postStatusSchema = z.enum(PostStatus);
export const inlineEditActionSchema = z.enum(["rewrite", "shorten", "change_hook"]);

export const updatePostSchema = z.object({
  id: z.string().uuid(),
  finalText: z.string().trim().min(1),
});

export const queryPostsSchema = z.object({
  status: postStatusSchema.optional(),
  pillar: pillarSchema.optional(),
  limit: z.number().int().positive().max(100).default(20),
  cursor: z.string().uuid().optional(),
});

export const inlineEditInputSchema = z.object({
  postId: z.string().uuid(),
  action: inlineEditActionSchema,
  selectedText: z.string().min(1),
  contextText: z.string(),
});

export type UpdatePostInput = z.infer<typeof updatePostSchema>;
export type QueryPostsInput = z.infer<typeof queryPostsSchema>;
export type InlineEditInput = z.infer<typeof inlineEditInputSchema>;
