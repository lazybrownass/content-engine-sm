import { streamObject, type LanguageModel } from "ai";

import { generationOutputSchema } from "./schema";

function repairJsonText(text: string): string {
  const fenced = text.replace(/```json\s*|\s*```/g, "").trim();
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  return start >= 0 && end > start ? fenced.slice(start, end + 1) : fenced;
}

export function streamGeneration({
  model,
  system,
  prompt,
}: {
  model: LanguageModel;
  system: string;
  prompt: string;
}) {
  return streamObject({
    model,
    schema: generationOutputSchema,
    system,
    prompt,
    experimental_repairText: async ({ text }) => repairJsonText(text),
    onError: ({ error }) => console.error("[generate] streamObject error", error),
  });
}
