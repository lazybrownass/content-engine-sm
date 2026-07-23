import type { Metadata } from "next";

import { getBrandVoices } from "@/features/brand-voice/queries";
import { GenerationWorkspace } from "@/features/generation/components/generation-workspace";

export const metadata: Metadata = {
  title: "Generate — LinkedIn Content Engine",
  description: "Generate a LinkedIn post, X thread, and hook from a topic.",
};

export default async function GeneratePage() {
  const brandVoices = await getBrandVoices();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Generate</h1>
        <p className="text-sm text-muted-foreground">
          Turn a topic into a LinkedIn post, X thread, and hook grounded in your knowledge base.
        </p>
      </div>

      <GenerationWorkspace brandVoices={brandVoices} />
    </div>
  );
}
