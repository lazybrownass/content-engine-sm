import type { PublishingProvider } from "./provider.interface";

// Always available, zero external dependencies: dispatch is an immediate no-op success —
// the owner copies the post text themselves and confirms publish via confirmManualPublish.
export const manualProvider: PublishingProvider = {
  type: "MANUAL",
  async dispatch() {
    return { status: "DISPATCHED" };
  },
  async ping() {
    return { ok: true };
  },
};
