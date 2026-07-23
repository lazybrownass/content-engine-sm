import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEnumLabel } from "@/lib/utils";
import type { AnalyticsOverview } from "@/features/analytics/queries";

function formatPercent(rate: number | null): string {
  if (rate === null) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

export function AnalyticsOverviewCards({ overview }: { overview: AnalyticsOverview }) {
  const { totalSnapshots, avgEngagementRate, topPillar, sampleGate } = overview;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader>
          <CardDescription>Total Snapshots</CardDescription>
          <CardTitle className="text-2xl">{totalSnapshots}</CardTitle>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardDescription>Avg Engagement Rate</CardDescription>
          <CardTitle className="text-2xl">{formatPercent(avgEngagementRate)}</CardTitle>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardDescription>Top Performing Pillar</CardDescription>
          <CardTitle className="text-2xl">
            {topPillar ? formatEnumLabel(topPillar.pillar) : "Not enough data yet"}
          </CardTitle>
        </CardHeader>
        {topPillar && (
          <CardContent className="text-sm text-muted-foreground">
            {formatPercent(topPillar.avgEngagementRate)} avg engagement
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardDescription>Style Memory Learning Gate</CardDescription>
          <CardTitle className="text-2xl">
            {sampleGate.scoredPostCount}/{sampleGate.threshold} sample posts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Badge variant={sampleGate.met ? "default" : "outline"}>
            {sampleGate.met ? "Learning active" : "Collecting data"}
          </Badge>
        </CardContent>
      </Card>
    </div>
  );
}
