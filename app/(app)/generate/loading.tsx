export default function GenerateLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-14 w-64 animate-pulse rounded-lg bg-muted" />
      <div className="h-16 animate-pulse rounded-lg bg-muted" />
      <div className="h-40 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
