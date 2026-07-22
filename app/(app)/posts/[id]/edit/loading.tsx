export default function PostEditLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-8 w-72 animate-pulse rounded-lg bg-muted" />
      <div className="h-8 w-96 animate-pulse rounded-full bg-muted" />
      <div className="h-96 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
