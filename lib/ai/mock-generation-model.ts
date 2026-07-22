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

// A single combined payload for the ai SDK's generateObject() path (used by every
// features/pipeline stage via generateStageObject — outline/draft/grill_review/
// topic_generation/inline_edit). Each stage's Zod schema only picks out its own
// subset of keys and ignores the rest, so one object can satisfy all of them without
// this mock needing to know which purpose/schema is being requested.
const MOCK_GENERATE_OBJECT_PAYLOAD = {
  sections: ["Hook", "Body", "CTA"],
  content: "This is a mock drafted post used only for deterministic E2E runs.",
  qualityScore: 95,
  violations: [] as string[],
  suggestions: [
    {
      title: "Mock topic suggestion",
      rationale: "Mock rationale for a deterministic E2E run.",
      pillar: "CASE_STUDY",
      sourceKnowledgeIds: [] as string[],
      score: 0.8,
    },
  ],
  result: "Mock inline edit result.",
};

export function createMockGenerationModel(): LanguageModelV2 {
  return {
    specificationVersion: "v2",
    provider: "mock",
    modelId: "mock-generation-model",
    supportedUrls: {},
    async doGenerate() {
      return {
        content: [{ type: "text", text: JSON.stringify(MOCK_GENERATE_OBJECT_PAYLOAD) }],
        finishReason: "stop",
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        warnings: [],
      };
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
