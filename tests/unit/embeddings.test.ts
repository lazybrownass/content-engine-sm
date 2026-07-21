import { describe, expect, it, vi } from "vitest";

import { callHuggingFaceInference } from "@/lib/ai/providers/huggingface";
import { embed, embedQuery, meanPool } from "@/lib/ai/embeddings";

vi.mock("@/lib/ai/providers/huggingface", () => ({
  callHuggingFaceInference: vi.fn(),
}));

const dim768 = (fill: number) => new Array(768).fill(fill);

describe("meanPool", () => {
  it("averages token vectors dimension-wise", () => {
    expect(meanPool([[1, 2, 3], [3, 4, 5]])).toEqual([2, 3, 4]);
  });

  it("throws on an empty input", () => {
    expect(() => meanPool([])).toThrow();
  });
});

describe("embed", () => {
  it("returns [] without calling the provider for an empty input", async () => {
    const result = await embed([]);
    expect(result).toEqual([]);
    expect(callHuggingFaceInference).not.toHaveBeenCalled();
  });

  it("returns already-pooled vectors as-is", async () => {
    vi.mocked(callHuggingFaceInference).mockResolvedValue([dim768(0.1), dim768(0.2)]);

    const result = await embed(["a", "b"]);

    expect(result).toEqual([dim768(0.1), dim768(0.2)]);
    expect(callHuggingFaceInference).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "BAAI/bge-base-en-v1.5",
        inputs: ["a", "b"],
        path: "pipeline/feature-extraction",
      }),
    );
  });

  it("mean-pools token-level responses", async () => {
    const tokenVectors = [dim768(1), dim768(3)];
    vi.mocked(callHuggingFaceInference).mockResolvedValue([tokenVectors]);

    const result = await embed(["a"]);

    expect(result).toEqual([dim768(2)]);
  });

  it("throws when the response vector count does not match the input count", async () => {
    vi.mocked(callHuggingFaceInference).mockResolvedValue([dim768(0.1)]);

    await expect(embed(["a", "b"])).rejects.toThrow(/shape mismatch/);
  });

  it("throws when a vector has the wrong dimensionality", async () => {
    vi.mocked(callHuggingFaceInference).mockResolvedValue([[1, 2, 3]]);

    await expect(embed(["a"])).rejects.toThrow(/unexpected shape/);
  });
});

describe("embedQuery", () => {
  it("returns the single embedded vector", async () => {
    vi.mocked(callHuggingFaceInference).mockResolvedValue([dim768(0.5)]);

    const result = await embedQuery("hello");

    expect(result).toEqual(dim768(0.5));
  });
});
