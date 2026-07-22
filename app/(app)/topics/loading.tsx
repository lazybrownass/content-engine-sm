export default function TopicsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-14 w-64 animate-pulse rounded-lg bg-muted" />
      <div className="h-8 w-72 animate-pulse rounded-full bg-muted" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-40 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  );
}
