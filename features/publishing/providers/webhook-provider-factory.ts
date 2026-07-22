import type { AutomationProvider } from "@prisma/client";

import { signPayload } from "@/lib/publishing/signing";

import type { PublishingProvider } from "./provider.interface";

function resolveSecret(automationProvider: AutomationProvider): string | undefined {
  return automationProvider.signingSecretRef
    ? process.env[automationProvider.signingSecretRef]
    : undefined;
}

function dispatchTimeoutMs(): number {
  return Number(process.env.PUBLISHING_DISPATCH_TIMEOUT_MS ?? 10_000);
}

async function postSigned(
  url: string,
  secret: string,
  payload: unknown,
): Promise<{ ok: boolean; status: number }> {
  const body = JSON.stringify(payload);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Signature": signPayload(body, secret) },
    body,
    signal: AbortSignal.timeout(dispatchTimeoutMs()),
  });
  return { ok: response.ok, status: response.status };
}

// Shared by n8n.provider.ts and make.provider.ts, which differ only in provider type
// and callback path — both use the same signed-dispatch/signed-ping shape.
export function createSignedWebhookProvider(
  type: "N8N" | "MAKE",
  callbackPath: string,
): PublishingProvider {
  return {
    type,

    async dispatch({ job, schedule, post, automationProvider }) {
      const secret = resolveSecret(automationProvider);
      if (!automationProvider.configRef || !secret) {
        return {
          status: "FAILED",
          errorMessage: "AutomationProvider is missing a webhook URL or signing secret",
        };
      }

      try {
        const { ok, status } = await postSigned(automationProvider.configRef, secret, {
          jobId: job.id,
          postId: post.id,
          text: post.finalText,
          scheduledAt: schedule.scheduledAt.toISOString(),
          callbackUrl: `${process.env.APP_BASE_URL ?? ""}${callbackPath}`,
        });
        return ok
          ? { status: "DISPATCHED" }
          : { status: "FAILED", errorMessage: `Webhook responded with status ${status}` };
      } catch (error) {
        return {
          status: "FAILED",
          errorMessage: error instanceof Error ? error.message : "Dispatch failed",
        };
      }
    },

    async ping(automationProvider) {
      const secret = resolveSecret(automationProvider);
      if (!automationProvider.configRef || !secret) {
        return { ok: false, errorMessage: "Missing webhook URL or signing secret" };
      }

      try {
        const { ok, status } = await postSigned(automationProvider.configRef, secret, {
          type: "ping",
          timestamp: new Date().toISOString(),
        });
        return ok ? { ok: true } : { ok: false, errorMessage: `Webhook responded with status ${status}` };
      } catch (error) {
        return { ok: false, errorMessage: error instanceof Error ? error.message : "Ping failed" };
      }
    },
  };
}
