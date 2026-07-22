import { notFound } from "next/navigation";

import { getPostById } from "@/features/posts/queries";
import { PostEditor } from "@/features/posts/components/post-editor";

export default async function PostEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const post = await getPostById(id);

  if (!post) {
    notFound();
  }

  return <PostEditor post={post} />;
}
