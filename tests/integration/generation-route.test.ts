import { describe, expect, it } from "vitest";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV2 } from "ai/test";

import { streamGeneration } from "@/features/generation/synthesize";

// Per ai/AGENTS.md §9.3, never assert on real model output in CI — the model call is
// always mocked here.

function mockModelReturningText(text: string) {
  return new MockLanguageModelV2({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "1" },
          { type: "text-delta", id: "1", delta: text },
          { type: "text-end", id: "1" },
          {
            type: "finish",
            finishReason: "stop",
            usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
          },
        ],
      }),
    }),
  });
}

// streamObject's `.object` promise is driven by actually pulling the underlying
// stream (as the real route does via toTextStreamResponse()) — awaiting `.object`
// alone never resolves, so tests must drain fullStream first.
async function drain(result: ReturnType<typeof streamGeneration>) {
  for await (const part of result.fullStream) {
    void part;
  }
  return result.object;
}

describe("streamGeneration", () => {
  it("parses a clean JSON response into a valid generationOutputSchema object", async () => {
    const payload = {
      hook: "A hook",
      linkedInPost: "A full post",
      tweetThread: ["First tweet", "Second tweet"],
    };

    const result = streamGeneration({
      model: mockModelReturningText(JSON.stringify(payload)),
      system: "system prompt",
      prompt: "user prompt",
    });

    const object = await drain(result);
    expect(object).toEqual(payload);
  });

  it("recovers a fenced-JSON response via experimental_repairText", async () => {
    const payload = {
      hook: "A hook",
      linkedInPost: "A full post",
      tweetThread: ["First tweet"],
    };
    const fenced = "```json\n" + JSON.stringify(payload) + "\n```";

    const result = streamGeneration({
      model: mockModelReturningText(fenced),
      system: "system prompt",
      prompt: "user prompt",
    });

    const object = await drain(result);
    expect(object).toEqual(payload);
  });
});
