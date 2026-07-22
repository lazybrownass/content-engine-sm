import { createSignedWebhookProvider } from "./webhook-provider-factory";

export const makeProvider = createSignedWebhookProvider("MAKE", "/api/webhooks/make");
