import type { Metadata } from "next";

import { getTopics } from "@/features/topics/queries";
import { GenerateTopicsButton } from "@/features/topics/components/generate-topics-button";
import { TopicList } from "@/features/topics/components/topic-list";

export const metadata: Metadata = {
  title: "Topics — LinkedIn Content Engine",
  description: "Review and accept AI-suggested topics.",
};

type SearchParams = Record<string, string | string[] | undefined>;

export default async function TopicsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const get = (key: string): string | undefined => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const status = get("status");
  const cursor = get("cursor");

  const result = await getTopics({
    ...(status && { status }),
    ...(cursor && { cursor }),
  });

  const filterParams: Record<string, string> = {};
  if (status) filterParams.status = status;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Topics</h1>
          <p className="text-sm text-muted-foreground">
            AI-suggested post ideas grounded in your knowledge base.
          </p>
        </div>
        <GenerateTopicsButton />
      </div>

      <TopicList
        topics={result.items}
        nextCursor={result.nextCursor}
        searchParams={filterParams}
        currentStatus={status}
      />
    </div>
  );
}
