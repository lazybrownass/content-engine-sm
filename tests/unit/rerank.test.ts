import { describe, expect, it, vi } from "vitest";

import { callHuggingFaceInference } from "@/lib/ai/providers/huggingface";
import { rerank } from "@/lib/ai/rerank";

vi.mock("@/lib/ai/providers/huggingface", () => ({
  callHuggingFaceInference: vi.fn(),
}));

describe("rerank", () => {
  it("returns [] and makes no call for an empty candidate list", async () => {
    const result = await rerank("query", []);
    expect(result).toEqual([]);
    expect(callHuggingFaceInference).not.toHaveBeenCalled();
  });

  it("zips scores back to candidate ids and sorts descending (bare array response)", async () => {
    vi.mocked(callHuggingFaceInference).mockResolvedValue([0.2, 0.9, 0.5]);

    const result = await rerank("query", [
      { id: "a", text: "doc a" },
      { id: "b", text: "doc b" },
      { id: "c", text: "doc c" },
    ]);

    expect(result).toEqual([
      { id: "b", score: 0.9 },
      { id: "c", score: 0.5 },
      { id: "a", score: 0.2 },
    ]);
    expect(callHuggingFaceInference).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "BAAI/bge-reranker-v2-m3",
        inputs: [
          ["query", "doc a"],
          ["query", "doc b"],
          ["query", "doc c"],
        ],
      }),
    );
  });

  it("accepts a { output: number[] } response shape", async () => {
    vi.mocked(callHuggingFaceInference).mockResolvedValue({ output: [0.1, 0.8] });

    const result = await rerank("query", [
      { id: "a", text: "doc a" },
      { id: "b", text: "doc b" },
    ]);

    expect(result).toEqual([
      { id: "b", score: 0.8 },
      { id: "a", score: 0.1 },
    ]);
  });

  it("throws on a response length mismatch", async () => {
    vi.mocked(callHuggingFaceInference).mockResolvedValue([0.1]);

    await expect(
      rerank("query", [
        { id: "a", text: "doc a" },
        { id: "b", text: "doc b" },
      ]),
    ).rejects.toThrow(/shape mismatch/);
  });
});
