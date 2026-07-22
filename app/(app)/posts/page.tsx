import { getPosts } from "@/features/posts/queries";
import { PostList } from "@/features/posts/components/post-list";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function PostsPage({
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
  const pillar = get("pillar");
  const cursor = get("cursor");

  const result = await getPosts({
    ...(status && { status }),
    ...(pillar && { pillar }),
    ...(cursor && { cursor }),
  });

  const filterParams: Record<string, string> = {};
  if (status) filterParams.status = status;
  if (pillar) filterParams.pillar = pillar;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Posts</h1>
        <p className="text-sm text-muted-foreground">
          Posts generated from accepted topics, ready for review and approval.
        </p>
      </div>

      <PostList posts={result.items} nextCursor={result.nextCursor} searchParams={filterParams} />
    </div>
  );
}
