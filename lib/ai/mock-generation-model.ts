import type { LanguageModelV2, LanguageModelV2StreamPart } from "@ai-sdk/provider";

// A hand-rolled, dependency-free mock model for E2E runs (E2E_MOCK_LLM=1) — deliberately
// not reusing ai/test's MockLanguageModelV2, since that bundle requires msw, a devDependency
// that would otherwise leak into the production build via lib/ai/model-router.ts.
// ai/AGENTS.md 9.3: never assert on real model output in CI.
const MOCK_PAYLOAD = {
  hook: "Here's the mock hook.",
  linkedInPost: "This is a mock LinkedIn post used only for deterministic E2E runs.",
  tweetThread: ["Mock tweet one.", "Mock tweet two."],
};

export function createMockGenerationModel(): LanguageModelV2 {
  return {
    specificationVersion: "v2",
    provider: "mock",
    modelId: "mock-generation-model",
    supportedUrls: {},
    async doGenerate() {
      throw new Error("createMockGenerationModel only supports doStream");
    },
    async doStream() {
      const chunks: LanguageModelV2StreamPart[] = [
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "1" },
        { type: "text-delta", id: "1", delta: JSON.stringify(MOCK_PAYLOAD) },
        { type: "text-end", id: "1" },
        {
          type: "finish",
          finishReason: "stop",
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        },
      ];
      return {
        stream: new ReadableStream<LanguageModelV2StreamPart>({
          start(controller) {
            for (const chunk of chunks) controller.enqueue(chunk);
            controller.close();
          },
        }),
      };
    },
  };
}
