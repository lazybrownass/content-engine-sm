import { z } from "zod";

export const generateRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  brandVoiceId: z.string().uuid().optional(),
});

export type GenerateRequest = z.infer<typeof generateRequestSchema>;

// Model-authored fields use .describe() (soft guidance), not hard .max() — a hard
// length cap makes streamObject's final validation throw whenever the model
// overshoots by one character. Length is reinforced in the prompt and shown via
// a live UI character counter instead.
export const generationOutputSchema = z.object({
  hook: z.string().describe("A short scroll-stopping hook, <= 120 characters."),
  linkedInPost: z.string().describe("Full LinkedIn post in the brand voice."),
  tweetThread: z
    .array(z.string().describe("One tweet, aim for <= 280 characters."))
    .min(1)
    .describe("An X/Twitter thread, 3-7 tweets."),
});

export type GenerationOutput = z.infer<typeof generationOutputSchema>;
