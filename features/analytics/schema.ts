import { z } from "zod";

// Manual analytics entry: metrics an owner reads off LinkedIn for a published post.
// All metric fields are optional (the platform surfaces them at different times);
// engagementRate is derived from impressions + interactions when omitted.
export const logAnalyticsInputSchema = z.object({
  postId: z.string().uuid(),
  source: z.enum(["manual", "playwright"]).default("manual"),
  impressions: z.number().int().nonnegative().nullish(),
  reactions: z.number().int().nonnegative().nullish(),
  comments: z.number().int().nonnegative().nullish(),
  reposts: z.number().int().nonnegative().nullish(),
  clicks: z.number().int().nonnegative().nullish(),
  engagementRate: z.number().nonnegative().nullish(),
});

export type LogAnalyticsInput = z.infer<typeof logAnalyticsInputSchema>;

// Interactions ÷ impressions, as a fraction (0–1). Returns null when we can't derive it.
export function deriveEngagementRate(input: LogAnalyticsInput): number | null {
  if (input.engagementRate != null) return input.engagementRate;
  if (!input.impressions) return null;
  const interactions =
    (input.reactions ?? 0) + (input.comments ?? 0) + (input.reposts ?? 0) + (input.clicks ?? 0);
  return interactions / input.impressions;
}
