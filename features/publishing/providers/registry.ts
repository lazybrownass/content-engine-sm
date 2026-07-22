import type { PublishingProviderType } from "@prisma/client";

import { makeProvider } from "./make.provider";
import { manualProvider } from "./manual.provider";
import { n8nProvider } from "./n8n.provider";
import type { PublishingProvider } from "./provider.interface";

export const publishingProviders: Record<PublishingProviderType, PublishingProvider> = {
  MANUAL: manualProvider,
  N8N: n8nProvider,
  MAKE: makeProvider,
};
