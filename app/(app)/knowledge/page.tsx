import type { Metadata } from "next";
import { KnowledgeCategory, Pillar, type KnowledgeItem } from "@prisma/client";

import { formatEnumLabel } from "@/lib/utils";
import { getKnowledgeItems, searchKnowledgeItems } from "@/features/knowledge/queries";
import { KnowledgeList } from "@/features/knowledge/components/knowledge-list";

export const metadata: Metadata = {
  title: "Knowledge — LinkedIn Content Engine",
  description: "Search and manage your knowledge base.",
};

type SearchParams = Record<string, string | string[] | undefined>;

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const get = (key: string): string | undefined => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const category = get("category");
  const pillar = get("pillar");
  const q = get("q");
  const cursor = get("cursor");
  const trimmedQuery = q?.trim();

  let items: KnowledgeItem[];
  let nextCursor: string | null = null;
  let relevance: Record<string, { score: number; matchedContent: string }> | undefined;

  if (trimmedQuery) {
    const results = await searchKnowledgeItems(trimmedQuery);
    items = results.map((result) => result.item);
    relevance = Object.fromEntries(
      results.map((result) => [
        result.item.id,
        { score: result.score, matchedContent: result.matchedContent },
      ]),
    );
  } else {
    const result = await getKnowledgeItems({
      ...(category && { category }),
      ...(pillar && { pillar }),
      ...(cursor && { cursor }),
    });
    items = result.items;
    nextCursor = result.nextCursor;
  }

  const filterParams: Record<string, string> = {};
  if (category) filterParams.category = category;
  if (pillar) filterParams.pillar = pillar;
  if (q) filterParams.q = q;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Knowledge Base</h1>
        <p className="text-sm text-muted-foreground">
          The source material topics, drafts, and search draw from.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="q" className="text-sm font-medium">
            Search
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q ?? ""}
            placeholder="Search by keyword or meaning..."
            className="h-8 w-56 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="category" className="text-sm font-medium">
            Category
          </label>
          <select
            id="category"
            name="category"
            defaultValue={category ?? ""}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">All categories</option>
            {Object.values(KnowledgeCategory).map((value) => (
              <option key={value} value={value}>
                {formatEnumLabel(value)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="pillar" className="text-sm font-medium">
            Pillar
          </label>
          <select
            id="pillar"
            name="pillar"
            defaultValue={pillar ?? ""}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">All pillars</option>
            {Object.values(Pillar).map((value) => (
              <option key={value} value={value}>
                {formatEnumLabel(value)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="h-8 rounded-lg border border-input bg-background px-3 text-sm font-medium hover:bg-muted"
        >
          Apply
        </button>
      </form>

      <KnowledgeList
        items={items}
        nextCursor={nextCursor}
        searchParams={filterParams}
        query={trimmedQuery}
        relevance={relevance}
      />
    </div>
  );
}
