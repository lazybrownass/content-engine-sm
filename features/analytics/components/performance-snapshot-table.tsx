import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEnumLabel } from "@/lib/utils";
import type { RecentAnalyticsSnapshot } from "@/features/analytics/queries";

function postLabel(post: RecentAnalyticsSnapshot["post"]): string {
  if (post.topic?.title) return post.topic.title;
  const firstLine = post.finalText?.split("\n").find((line) => line.trim().length > 0);
  return firstLine ? firstLine.slice(0, 60) : "Untitled post";
}

function formatPercent(rate: number | null): string {
  if (rate === null) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

export function PerformanceSnapshotTable({ snapshots }: { snapshots: RecentAnalyticsSnapshot[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Performance Snapshots</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-muted/50 text-xs">
            <tr>
              <th className="p-2">Captured</th>
              <th className="p-2">Post</th>
              <th className="p-2">Source</th>
              <th className="p-2">Impressions</th>
              <th className="p-2">Engagement Rate</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.length === 0 ? (
              <tr>
                <td className="p-4 text-center text-muted-foreground" colSpan={5}>
                  No analytics logged yet.
                </td>
              </tr>
            ) : (
              snapshots.map((snapshot) => (
                <tr key={snapshot.id} className="border-t">
                  <td className="p-2 whitespace-nowrap text-muted-foreground">
                    {snapshot.capturedAt.toLocaleDateString()}
                  </td>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <span className="line-clamp-1">{postLabel(snapshot.post)}</span>
                      <Badge variant="outline">{formatEnumLabel(snapshot.post.pillar)}</Badge>
                    </div>
                  </td>
                  <td className="p-2 capitalize">{snapshot.source}</td>
                  <td className="p-2">{snapshot.impressions ?? "—"}</td>
                  <td className="p-2 font-medium">{formatPercent(snapshot.engagementRate)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
