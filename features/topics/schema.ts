import { Pillar, TopicStatus } from "@prisma/client";
import { z } from "zod";

export const pillarSchema = z.enum(Pillar);
export const topicStatusSchema = z.enum(TopicStatus);

// No createTopicSchema — topics are only ever created via generateTopicSuggestions(),
// never manually authored (out of scope this phase).

export const updateTopicSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(200).optional(),
  rationale: z.string().trim().min(1).optional(),
  pillar: pillarSchema.optional(),
});

export const queryTopicsSchema = z.object({
  status: topicStatusSchema.optional(),
  pillar: pillarSchema.optional(),
  limit: z.number().int().positive().max(100).default(20),
  cursor: z.string().uuid().optional(),
});

export type UpdateTopicInput = z.infer<typeof updateTopicSchema>;
export type QueryTopicsInput = z.infer<typeof queryTopicsSchema>;
