import { describe, expect, it } from "vitest";

import { dedupeCandidates } from "@/lib/knowledge/search";

describe("dedupeCandidates", () => {
  it("keeps the first occurrence and preserves order", () => {
    const result = dedupeCandidates([
      { chunkId: "a", label: "first-a" },
      { chunkId: "b", label: "first-b" },
      { chunkId: "a", label: "second-a" },
    ]);

    expect(result).toEqual([
      { chunkId: "a", label: "first-a" },
      { chunkId: "b", label: "first-b" },
    ]);
  });

  it("returns an empty array for an empty input", () => {
    expect(dedupeCandidates([])).toEqual([]);
  });

  it("handles fully disjoint id sets without dropping anything", () => {
    const rows = [{ chunkId: "a" }, { chunkId: "b" }, { chunkId: "c" }];
    expect(dedupeCandidates(rows)).toEqual(rows);
  });
});
