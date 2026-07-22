import { createSignedWebhookProvider } from "./webhook-provider-factory";

export const n8nProvider = createSignedWebhookProvider("N8N", "/api/webhooks/n8n");
