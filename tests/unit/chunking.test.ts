import { describe, expect, it } from "vitest";

import { chunkText } from "@/lib/knowledge/chunking";

function nonWhitespaceContent(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

describe("chunkText", () => {
  it("returns [] for an empty or whitespace-only body", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("returns a single chunk for a short body", () => {
    const body = "A short note about a project.";
    expect(chunkText(body)).toEqual([body]);
  });

  it("packs multiple short paragraphs into one chunk under the budget", () => {
    const body = "Paragraph one.\n\nParagraph two.\n\nParagraph three.";
    const result = chunkText(body, { maxChunkChars: 1000 });
    expect(result).toEqual(["Paragraph one.\n\nParagraph two.\n\nParagraph three."]);
  });

  it("splits into multiple chunks once paragraphs exceed the budget, preserving order and content", () => {
    const paragraphs = ["A".repeat(40), "B".repeat(40), "C".repeat(40), "D".repeat(40)];
    const body = paragraphs.join("\n\n");

    const result = chunkText(body, { maxChunkChars: 90 });

    expect(result.length).toBeGreaterThan(1);
    // every chunk stays within budget
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(90);
    }
    // no content lost or reordered
    expect(nonWhitespaceContent(result.join(" "))).toBe(nonWhitespaceContent(paragraphs.join(" ")));
  });

  it("falls back to sentence-boundary splitting for a paragraph that alone exceeds the budget", () => {
    const sentences = ["First sentence here.", "Second sentence here.", "Third sentence here."];
    const body = sentences.join(" "); // one paragraph, no blank lines

    const result = chunkText(body, { maxChunkChars: 30 });

    expect(result.length).toBeGreaterThan(1);
    expect(nonWhitespaceContent(result.join(" "))).toBe(nonWhitespaceContent(body));
  });
});
