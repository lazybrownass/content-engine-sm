import type {
  AutomationProvider,
  Post,
  PublishingJob,
  PublishingJobStatus,
  PublishingProviderType,
  Schedule,
} from "@prisma/client";

export interface PublishingDispatchInput {
  job: PublishingJob;
  schedule: Schedule;
  post: Pick<Post, "id" | "finalText">;
  automationProvider: AutomationProvider;
}

export interface PublishingDispatchResult {
  status: Extract<PublishingJobStatus, "DISPATCHED" | "FAILED">;
  errorMessage?: string;
}

export interface PublishingPingResult {
  ok: boolean;
  errorMessage?: string;
}

export interface PublishingProvider {
  type: PublishingProviderType;
  dispatch(input: PublishingDispatchInput): Promise<PublishingDispatchResult>;
  ping(automationProvider: AutomationProvider): Promise<PublishingPingResult>;
}
