import { PublishingJobStatus, PublishingProviderType } from "@prisma/client";
import { z } from "zod";

export const publishingProviderTypeSchema = z.enum(PublishingProviderType);
export const publishingJobStatusSchema = z.enum(PublishingJobStatus);

export const scheduleInputSchema = z.object({
  postId: z.string().uuid(),
  scheduledAt: z.coerce.date(),
  timezone: z.string().trim().min(1).default("UTC"),
  automationProviderId: z.string().uuid(),
});

export const cancelScheduleSchema = z.object({
  postId: z.string().uuid(),
});

export const retryJobSchema = z.object({
  jobId: z.string().uuid(),
  scheduledAt: z.coerce.date().optional(),
  automationProviderId: z.string().uuid().optional(),
});

export const confirmManualPublishSchema = z.object({
  jobId: z.string().uuid(),
  linkedinUrl: z.string().url().optional(),
});

export const resolveUnconfirmedSchema = z.object({
  jobId: z.string().uuid(),
  outcome: z.enum(["published", "failed"]),
  linkedinUrl: z.string().url().optional(),
});

// MANUAL is excluded here — it is lazily auto-provisioned per owner, never user-created.
export const createAutomationProviderSchema = z.object({
  type: z.enum(["N8N", "MAKE"]),
  label: z.string().trim().min(1),
  configRef: z.string().url(),
  signingSecretRef: z.string().trim().min(1),
});

export const testAutomationProviderSchema = z.object({
  id: z.string().uuid(),
});

export type ScheduleInput = z.infer<typeof scheduleInputSchema>;
export type CancelScheduleInput = z.infer<typeof cancelScheduleSchema>;
export type RetryJobInput = z.infer<typeof retryJobSchema>;
export type ConfirmManualPublishInput = z.infer<typeof confirmManualPublishSchema>;
export type ResolveUnconfirmedInput = z.infer<typeof resolveUnconfirmedSchema>;
export type CreateAutomationProviderInput = z.infer<typeof createAutomationProviderSchema>;
export type TestAutomationProviderInput = z.infer<typeof testAutomationProviderSchema>;
